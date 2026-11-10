import SwiftUI

/*
 * Fiches : une carte « Réviser » pour tout ce qui est dû dans les paquets
 * suivis, puis les paquets Suivis, Récemment ajoutés et par matière
 * (comme `/fiches`). Toucher un paquet ouvre sa fiche ; la révision
 * s'ouvre en plein écran.
 */
struct FichesVue: View {
    @State private var recherche = ""
    @State private var session: SessionRevision?
    @State private var chemin: [Paquet] = []
    @State private var creation = false
    @Environment(Session.self) private var compte

    var body: some View {
        NavigationStack(path: $chemin) {
            Chargement({ try await $0.get("api/app/fiches") as ReponseFiches }) { r, recharger in
                ListeFiches(r: r, recherche: recherche, reviser: { session = $0 })
                    .refreshable { await recharger() }
                    .fullScreenCover(item: $session, onDismiss: { Task { await recharger() } }) { s in
                        RevisionVue(session: s)
                    }
                    .navigationDestination(for: Paquet.self) { p in
                        PaquetDetail(initial: p, reviser: { session = $0 }, apres: recharger)
                    }
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button { creation = true } label: { Image(systemName: "plus") }
                                .accessibilityLabel("Nouveau paquet")
                        }
                    }
                    .sheet(isPresented: $creation) {
                        FormulairePaquet(matieres: r.matieres) { id in
                            // Ouvre le paquet créé, prêt à recevoir ses cartes.
                            let liste: ReponseFiches? = try? await compte.api.get("api/app/fiches")
                            await recharger()
                            if let id, let p = liste?.paquets.first(where: { $0.id == id }) { chemin.append(p) }
                        }
                    }
            }
            .background(Color.fond)
            .navigationTitle("Fiches")
            .searchable(text: $recherche, prompt: "Titre, matière ou auteur")
        }
    }
}

/// Une session de révision : un paquet, ou tous les paquets suivis (flash).
struct SessionRevision: Identifiable, Hashable {
    let paquet: Int?
    let titre: String
    var id: String { paquet.map(String.init) ?? "tout" }
}

private struct ListeFiches: View {
    let r: ReponseFiches
    let recherche: String
    let reviser: (SessionRevision) -> Void

    private var filtres: [Paquet] {
        let q = recherche.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return r.paquets }
        return r.paquets.filter {
            [$0.titre, $0.matiere ?? "", $0.createur].contains { $0.localizedStandardContains(q) }
        }
    }

    var body: some View {
        let paquets = filtres
        let suivis = paquets.filter(\.abonne)
        let recents = paquets.sorted { $0.createdAt > $1.createdAt }.prefix(6)
        let dues = suivis.reduce(0) { $0 + $1.aFaire }
        let parMatiere = Dictionary(grouping: paquets) { $0.matiere ?? "Sans matière" }
            .sorted { $0.key.localizedStandardCompare($1.key) == .orderedAscending }

        ScrollView {
            LazyVStack(alignment: .leading, spacing: Espace.xxl) {
                if recherche.isEmpty {
                    CarteReviserTout(dues: dues, suivis: suivis.count) {
                        reviser(SessionRevision(paquet: nil, titre: "Paquets suivis"))
                    }
                }
                if paquets.isEmpty {
                    ContentUnavailableView.search(text: recherche)
                }
                if !suivis.isEmpty {
                    Groupe(titre: "Suivis", detail: "\(suivis.count)", paquets: suivis)
                }
                if recherche.isEmpty && !recents.isEmpty {
                    VStack(alignment: .leading, spacing: Espace.m) {
                        TitreSection(titre: "Récemment ajoutés")
                        ScrollView(.horizontal, showsIndicators: false) {
                            LazyHStack(spacing: Espace.m) {
                                ForEach(Array(recents)) { p in
                                    NavigationLink(value: p) { TuilePaquet(paquet: p) }.buttonStyle(.plain)
                                }
                            }
                            .scrollTargetLayout()
                            .padding(.horizontal, Espace.l)
                        }
                        .scrollTargetBehavior(.viewAligned)
                        .padding(.horizontal, -Espace.l)
                    }
                }
                ForEach(parMatiere, id: \.key) { m in
                    Groupe(titre: m.key, detail: nil, paquets: m.value.sorted { $0.titre.localizedStandardCompare($1.titre) == .orderedAscending })
                }
            }
            .padding(.horizontal, Espace.l)
            .padding(.vertical, Espace.s)
        }
    }
}

private struct CarteReviserTout: View {
    let dues: Int
    let suivis: Int
    let action: () -> Void

    var body: some View {
        if suivis == 0 {
            HStack(spacing: Espace.m) {
                Image(systemName: "plus.circle.fill").font(.title2).foregroundStyle(Color.accent)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Suis un paquet pour commencer").font(.body.weight(.semibold))
                    Text("Ouvre un paquet ci-dessous et touche « Suivre ». Ses cartes entreront dans tes révisions.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
            }
            .carte()
        } else if dues == 0 {
            HStack(spacing: Espace.m) {
                Image(systemName: "checkmark.seal.fill").font(.title).foregroundStyle(.green)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Tout est révisé").font(.body.weight(.semibold))
                    Text("Reviens plus tard : les cartes réapparaissent quand il faut.")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
            }
            .carte()
        } else {
            Button(action: action) {
                HStack(spacing: Espace.l) {
                    VStack(alignment: .leading, spacing: Espace.xs) {
                        Text("\(dues)")
                            .font(.system(size: 40, weight: .semibold, design: .rounded))
                            .monospacedDigit().foregroundStyle(Color.accent)
                        Text(dues == 1 ? "carte à réviser" : "cartes à réviser").font(.subheadline).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Label("Réviser", systemImage: "play.fill")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                        .padding(.horizontal, Espace.l).frame(minHeight: 44)
                        .background(Color.accent, in: .capsule)
                }
                .carte()
            }
            .buttonStyle(.plain)
        }
    }
}

private struct Groupe: View {
    let titre: String
    let detail: String?
    let paquets: [Paquet]

    var body: some View {
        VStack(alignment: .leading, spacing: Espace.m) {
            TitreSection(titre: titre, detail: detail)
            VStack(spacing: 0) {
                ForEach(Array(paquets.enumerated()), id: \.element.id) { i, p in
                    if i > 0 { Divider().padding(.leading, 60) }
                    NavigationLink(value: p) { LignePaquet(paquet: p) }.buttonStyle(.plain)
                }
            }
            .carte(marge: 0)
        }
    }
}

struct LignePaquet: View {
    let paquet: Paquet

    var body: some View {
        HStack(spacing: Espace.m) {
            Image(systemName: paquet.abonne ? "rectangle.stack.fill" : "rectangle.stack")
                .font(.subheadline)
                .foregroundStyle(Color.matiere(paquet.couleur))
                .frame(width: 36, height: 36)
                .background(Color.matiere(paquet.couleur).opacity(0.12), in: .rect(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(paquet.titre).font(.body).foregroundStyle(.primary).lineLimit(2).multilineTextAlignment(.leading)
                Text("\(paquet.total) cartes · \(paquet.createur)").font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: Espace.s)
            if paquet.abonne && paquet.aFaire > 0 {
                Text("\(paquet.aFaire)")
                    .font(.subheadline.weight(.semibold)).monospacedDigit()
                    .foregroundStyle(Color.accent)
                    .padding(.horizontal, Espace.s).padding(.vertical, Espace.xs)
                    .background(Color.accent.opacity(0.12), in: .capsule)
            }
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
        }
        .padding(.horizontal, Espace.l)
        .padding(.vertical, Espace.m)
        .contentShape(.rect)
    }
}

private struct TuilePaquet: View {
    let paquet: Paquet
    var body: some View {
        VStack(alignment: .leading, spacing: Espace.s) {
            if let m = paquet.matiere { PastilleMatiere(nom: m, couleur: paquet.couleur) }
            Text(paquet.titre).font(.body.weight(.semibold)).lineLimit(2).multilineTextAlignment(.leading)
            Spacer(minLength: 0)
            Text("\(paquet.total) cartes").font(.caption).foregroundStyle(.secondary)
        }
        .frame(width: 168, height: 128, alignment: .topLeading)
        .carte()
    }
}
