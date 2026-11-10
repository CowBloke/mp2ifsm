import Observation
import SwiftUI
import UIKit
import UserNotifications

/*
 * Notifications de l'app (APNs) : autorisation, jeton de l'appareil
 * envoyé au serveur, destination quand on touche une notification.
 *
 * Le jeton est redemandé à chaque lancement (Apple peut le changer) et
 * renvoyé au serveur dès qu'il diffère, ou que le compte change. À la
 * déconnexion, ce téléphone est retiré du compte.
 */
@MainActor @Observable
final class Notifs {
    static let partage = Notifs()

    private(set) var autorisation: UNAuthorizationStatus = .notDetermined
    private(set) var jetonAppareil: String?
    /// Chemin porté par la notification touchée (« /flash », « / »…), consommé par la navigation.
    var destination: String?

    weak var session: Session?
    private var dejaEnvoye: String?

    /// Debug (xtool dev run) : serveurs de test d'Apple ; TestFlight et App Store : production.
    static var environnement: String {
        #if DEBUG
        "sandbox"
        #else
        "production"
        #endif
    }

    func actualiser() async {
        autorisation = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        if autorisation == .authorized || autorisation == .provisional || autorisation == .ephemeral {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    @discardableResult
    func demander() async -> Bool {
        let ok = (try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        await actualiser()
        return ok
    }

    func recu(jeton: Data) {
        jetonAppareil = jeton.map { String(format: "%02x", $0) }.joined()
        Task { await synchroniser() }
    }

    func synchroniser() async {
        guard let session, session.connecte, let jeton = jetonAppareil,
              let compte = session.utilisateur?.id else { return }
        let cle = "\(compte):\(jeton)"
        guard dejaEnvoye != cle else { return }
        do {
            try await session.api.envoyer("PUT", "api/app/notifications/appareil",
                                          ["jeton": jeton, "environnement": Self.environnement])
            dejaEnvoye = cle
        } catch {
            session.signaler(error)
        }
    }

    /// Avant la déconnexion : ce téléphone ne reçoit plus rien pour ce compte.
    func oublier(_ api: API) async {
        if let jeton = jetonAppareil {
            _ = try? await api.envoyer("DELETE", "api/app/notifications/appareil", ["jeton": jeton])
        }
        dejaEnvoye = nil
    }
}

/// Délégué UIKit : jeton APNs et notifications reçues (bannière même app ouverte).
final class DelegueApp: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken jeton: Data) {
        Task { @MainActor in Notifs.partage.recu(jeton: jeton) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError erreur: Error) {
        #if DEBUG
        print("APNs indisponible :", erreur.localizedDescription)
        #endif
    }

    func userNotificationCenter(_ centre: UNUserNotificationCenter,
                                willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    func userNotificationCenter(_ centre: UNUserNotificationCenter, didReceive reponse: UNNotificationResponse) async {
        let url = reponse.notification.request.content.userInfo["url"] as? String
        await MainActor.run { Notifs.partage.destination = url }
    }
}
