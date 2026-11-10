import SwiftUI

@main
struct MP2App: App {
    @UIApplicationDelegateAdaptor(DelegueApp.self) private var delegue
    @State private var session = Session()

    init() {
        // Couvertures et images de cartes : gardées sur le disque entre deux lancements.
        URLCache.shared = URLCache(memoryCapacity: 32 * 1024 * 1024, diskCapacity: 256 * 1024 * 1024)
    }

    var body: some Scene {
        WindowGroup {
            Racine()
                .environment(session)
                .tint(.accent)
        }
    }
}

private struct Racine: View {
    @Environment(Session.self) private var session
    @Environment(\.scenePhase) private var phase

    var body: some View {
        ZStack {
            if session.connecte {
                Onglets().transition(.opacity)
            } else {
                ConnexionVue().transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.smooth(duration: 0.35), value: session.connecte)
        // Partout : faire défiler range le clavier, comme dans Messages.
        .scrollDismissesKeyboard(.interactively)
        .task {
            Notifs.partage.session = session
            await Notifs.partage.actualiser()
        }
        // Compte connu (connexion, ou profil relu) : le jeton du téléphone lui est rattaché.
        .onChange(of: session.utilisateur?.id) { Task { await Notifs.partage.synchroniser() } }
        .onChange(of: phase) { _, p in if p == .active { Task { await Notifs.partage.actualiser() } } }
    }
}
