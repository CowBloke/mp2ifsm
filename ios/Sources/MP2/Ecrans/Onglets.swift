import SwiftUI

enum Onglet: Hashable { case accueil, fiches, colles, cours, divertissement }

/// Navigation principale : les cinq rubriques du site.
struct Onglets: View {
    @State private var onglet: Onglet = .accueil
    @State private var flash: SessionRevision?
    private var notifs = Notifs.partage

    var body: some View {
        TabView(selection: $onglet) {
            AccueilVue(onglet: $onglet)
                .tabItem { Label("Accueil", systemImage: "house") }
                .tag(Onglet.accueil)
            FichesVue()
                .tabItem { Label("Fiches", systemImage: "rectangle.on.rectangle.angled") }
                .tag(Onglet.fiches)
            CollesVue()
                .tabItem { Label("Colles", systemImage: "calendar") }
                .tag(Onglet.colles)
            OngletCours()
                .tabItem { Label("Cours", systemImage: "books.vertical") }
                .tag(Onglet.cours)
            VideosVue()
                .tabItem { Label("Détente", systemImage: "sparkles") }
                .tag(Onglet.divertissement)
        }
        .sensoryFeedback(.selection, trigger: onglet)
        // Notification touchée : le rappel des fiches ouvre la révision, le reste l'accueil.
        .onChange(of: notifs.destination, initial: true) { _, d in
            guard let d else { return }
            notifs.destination = nil
            onglet = .accueil
            if d.hasPrefix("/flash") { flash = SessionRevision(paquet: nil, titre: "Fiches du jour") }
        }
        .fullScreenCover(item: $flash) { RevisionVue(session: $0) }
    }
}
