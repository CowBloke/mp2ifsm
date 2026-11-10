import Foundation
import Security

/// Jeton de session dans le trousseau iOS (jamais dans UserDefaults).
enum Trousseau {
    private static let service = "com.mp2ifsm.session"
    private static let compte = "jeton"

    private static var requete: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: compte]
    }

    static func lire() -> String? {
        var q = requete
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var resultat: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &resultat) == errSecSuccess,
              let donnees = resultat as? Data else { return nil }
        return String(data: donnees, encoding: .utf8)
    }

    static func ecrire(_ jeton: String) {
        effacer()
        var q = requete
        q[kSecValueData as String] = Data(jeton.utf8)
        // Disponible après le premier déverrouillage : les rafraîchissements en arrière-plan marchent.
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    static func effacer() {
        SecItemDelete(requete as CFDictionary)
    }
}
