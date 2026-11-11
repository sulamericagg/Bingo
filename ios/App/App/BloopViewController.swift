import UIKit
import Capacitor

/// Controlador principal do app (equivalente ao MainActivity do Android).
/// - registra os plugins nativos do próprio app (mesmos nomes JS do Android);
/// - começa sempre em RETRATO (o menu nunca gira); as cenas 3D pedem paisagem pelo plugin
///   BloopOrientation, que troca `supportedOrientations` (a base CAPBridgeViewController
///   transforma esse array em `supportedInterfaceOrientations`).
class BloopViewController: CAPBridgeViewController {

    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        supportedOrientations = [UIInterfaceOrientation.portrait.rawValue]
        bridge?.registerPluginInstance(BloopOrientationPlugin())
        // @capacitor-community/speech-recognition 7.x não tem Package.swift (SPM) → versão própria, mesmo nome JS.
        bridge?.registerPluginInstance(BloopSpeechRecognitionPlugin())
    }

}
