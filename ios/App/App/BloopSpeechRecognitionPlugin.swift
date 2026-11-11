import Foundation
import AVFoundation
import Speech
import Capacitor

/// Reconhecimento de voz nativo (SFSpeechRecognizer) com o MESMO nome e contrato JS de
/// @capacitor-community/speech-recognition ("SpeechRecognition"), que no Android vem do npm.
/// O pacote 7.x não tem Package.swift, então o Capacitor 8 (Swift Package Manager) o deixa de
/// fora no iOS; este arquivo é uma versão própria (baseada no código MIT do plugin) usada por
/// src/pet/talk/stt.ts, src/cinema/speech.ts e src/games/cavafala/voice.ts.
///
/// Métodos: available, start({language,maxResults,partialResults}), stop, isListening,
/// getSupportedLanguages, checkPermissions, requestPermissions. Eventos: partialResults, listeningState.
/// ("popup" do Android é ignorado: o iOS não tem a janelinha do sistema.)
@objc(BloopSpeechRecognitionPlugin)
public class BloopSpeechRecognitionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BloopSpeechRecognitionPlugin"
    public let jsName = "SpeechRecognition"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSupportedLanguages", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise)
    ]

    private var recognizer: SFSpeechRecognizer?
    private var audioEngine: AVAudioEngine?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    /// categoria de áudio de antes de ouvir (o jogo volta a tocar normal depois)
    private var previousCategory: AVAudioSession.Category?
    private var previousOptions: AVAudioSession.CategoryOptions = []

    @objc func available(_ call: CAPPluginCall) {
        call.resolve(["available": SFSpeechRecognizer()?.isAvailable ?? false])
    }

    @objc func isListening(_ call: CAPPluginCall) {
        call.resolve(["listening": audioEngine?.isRunning ?? false])
    }

    @objc func getSupportedLanguages(_ call: CAPPluginCall) {
        call.resolve(["languages": SFSpeechRecognizer.supportedLocales().map { $0.identifier }])
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        call.resolve(["speechRecognition": Self.permissionState()])
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                DispatchQueue.main.async { call.resolve(["speechRecognition": Self.permissionState()]) }
                return
            }
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                DispatchQueue.main.async { call.resolve(["speechRecognition": granted ? "granted" : "denied"]) }
            }
        }
    }

    private static func permissionState() -> String {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized:
            return AVAudioSession.sharedInstance().recordPermission == .denied ? "denied" : "granted"
        case .denied, .restricted:
            return "denied"
        default:
            return "prompt"
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        if audioEngine?.isRunning == true {
            call.reject("Ongoing speech recognition")
            return
        }
        guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
            call.reject("Missing permission")
            return
        }
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            DispatchQueue.main.async {
                guard granted else {
                    call.reject("User denied access to microphone")
                    return
                }
                self.begin(call)
            }
        }
    }

    private func begin(_ call: CAPPluginCall) {
        let language = call.getString("language") ?? "pt-BR"
        let maxResults = call.getInt("maxResults") ?? 5
        let partial = call.getBool("partialResults") ?? false
        var settled = false
        let finish: (_ matches: [String]?, _ error: String?) -> Void = { matches, error in
            guard !settled else { return }
            settled = true
            if let error = error { call.reject(error) } else { call.resolve(["matches": matches ?? []]) }
        }

        task?.cancel()
        task = nil

        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language)) ?? SFSpeechRecognizer(),
              recognizer.isAvailable else {
            finish(nil, "Speech recognition not available")
            return
        }
        self.recognizer = recognizer

        let session = AVAudioSession.sharedInstance()
        previousCategory = session.category
        previousOptions = session.categoryOptions
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            finish(nil, "Microphone is already in use by another application.")
            return
        }

        let engine = AVAudioEngine()
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = partial
        audioEngine = engine
        request = req

        task = recognizer.recognitionTask(with: req) { [weak self] result, error in
            guard let self = self else { return }
            if let result = result {
                let matches = Array(result.transcriptions.prefix(max(1, maxResults)).map { $0.formattedString })
                if partial {
                    self.notifyListeners("partialResults", data: ["matches": matches])
                }
                if result.isFinal {
                    self.teardown()
                    finish(matches, nil) // com parciais o start já resolveu: aqui não faz nada
                }
            }
            if let error = error {
                self.teardown()
                finish(nil, error.localizedDescription)
            }
        }

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak req] buffer, _ in
            req?.append(buffer)
        }
        engine.prepare()
        do {
            try engine.start()
            notifyListeners("listeningState", data: ["status": "started"])
            if partial { finish([], nil) } // igual ao Android: com parciais o texto chega pelos eventos
        } catch {
            teardown()
            finish(nil, "Unknown error occured")
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let engine = self.audioEngine, engine.isRunning {
                engine.stop()
                engine.inputNode.removeTap(onBus: 0)
                self.request?.endAudio() // o resultado final ainda chega pelo recognitionTask
                self.notifyListeners("listeningState", data: ["status": "stopped"])
            }
            call.resolve()
        }
    }

    private func teardown() {
        DispatchQueue.main.async {
            if let engine = self.audioEngine {
                if engine.isRunning { engine.stop() }
                engine.inputNode.removeTap(onBus: 0)
            }
            let wasActive = self.audioEngine != nil
            self.audioEngine = nil
            self.request = nil
            self.task = nil
            if wasActive {
                self.notifyListeners("listeningState", data: ["status": "stopped"])
                if let cat = self.previousCategory {
                    try? AVAudioSession.sharedInstance().setCategory(cat, options: self.previousOptions)
                }
                self.previousCategory = nil
            }
        }
    }
}
