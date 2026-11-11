import UIKit
import Capacitor

/// Orientação controlada pelo próprio app (mesmo contrato do BloopOrientationPlugin.java):
/// set({ mode: "portrait" | "landscape" | "sensor" }) → { requested, current }.
/// iOS 16+: setNeedsUpdateOfSupportedInterfaceOrientations + requestGeometryUpdate.
/// iOS 15: UIDevice "orientation" + attemptRotationToDeviceOrientation (método clássico).
@objc(BloopOrientationPlugin)
public class BloopOrientationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BloopOrientationPlugin"
    public let jsName = "BloopOrientation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise)
    ]

    @objc func set(_ call: CAPPluginCall) {
        let mode = call.getString("mode") ?? "portrait"
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController as? CAPBridgeViewController else {
                call.reject("no view controller")
                return
            }
            let orientations: [UIInterfaceOrientation]
            let mask: UIInterfaceOrientationMask
            switch mode {
            case "landscape":
                orientations = [.landscapeRight, .landscapeLeft]
                mask = .landscape
            case "sensor":
                orientations = [.portrait, .landscapeLeft, .landscapeRight]
                mask = .allButUpsideDown
            default:
                orientations = [.portrait]
                mask = .portrait
            }
            vc.supportedOrientations = orientations.map { $0.rawValue }

            let scene = vc.view.window?.windowScene
                ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
            let before = scene?.interfaceOrientation ?? .portrait

            if #available(iOS 16.0, *) {
                vc.setNeedsUpdateOfSupportedInterfaceOrientations()
                // "sensor" só libera: o sistema gira quando o aparelho girar
                if let scene = scene, mode != "sensor" {
                    scene.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { error in
                        CAPLog.print("[BloopOrientation] requestGeometryUpdate(\(mode)) falhou: \(error.localizedDescription)")
                    }
                }
            } else {
                if mode == "landscape" && !before.isLandscape {
                    UIDevice.current.setValue(UIInterfaceOrientation.landscapeRight.rawValue, forKey: "orientation")
                } else if mode == "portrait" && before != .portrait {
                    UIDevice.current.setValue(UIInterfaceOrientation.portrait.rawValue, forKey: "orientation")
                }
                UIViewController.attemptRotationToDeviceOrientation()
            }

            call.resolve([
                "requested": Int(mask.rawValue),
                "current": before.isLandscape ? "landscape" : "portrait"
            ])
        }
    }
}
