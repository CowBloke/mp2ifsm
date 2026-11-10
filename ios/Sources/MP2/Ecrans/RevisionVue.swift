import SwiftUI

/*
 * Session de révision plein écran.
 *
 * Toucher la carte révèle la réponse ; s'il y a plusieurs trous, chaque
 * toucher en ouvre un, tiré au hasard (comme le site). Quatre boutons
 * notent la carte ; le serveur planifie (FSRS) et donne les intervalles.
 *
 * Fluidité : dès que la réponse est visible, la carte suivante est
 * préchargée en excluant la carte en cours (qui, une fois notée, sera
 * due plus tard) : c'est exactement celle que le serveur renverra, et
 * le passage est instantané.
 */
struct RevisionVue: View {
    let session: SessionRevision

    @Environment(Session.self) private var app
    @Environment(\.dismiss) private var fermer

    @State private var carte: CarteRendue?
    @State private var chargement = true
    @State private var revele = false
    @State private var trousOuverts: [Int: String] = [:]
    @State private var prechargee: Task<CarteRendue?, Error>?
    @State private var debut = Date.now
    @State private var revisees = 0
    @State private var debutSession = Date.now
    @State private var erreur: String?
    @State private var envoi = false
    @State private var retour = 0

    private var plusieursTrous: Bool { (carte?.trousHtml.count ?? 0) >= 2 }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.fond.ignoresSafeArea()
                if let carte {
                    contenu(carte)
                        .id(carte.cardId)
                        .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity),
                                                removal: .move(edge: .leading).combined(with: .opacity)))
                } else if chargement {
                    ProgressView().controlSize(.large)
                } else {
                    Fin(revisees: revisees, duree: Date.now.timeIntervalSince(debutSession)) { fermer() }
                        .transition(.scale(scale: 0.96).combined(with: .opacity))
                }
            }
            .animation(.smooth(duration: 0.3), value: carte?.cardId)
            .animation(.smooth(duration: 0.3), value: chargement)
            .navigationTitle(session.titre)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { fermer() } label: { Image(systemName: "xmark") }.accessibilityLabel("Terminer")
                }
                if let r = carte?.restant {
                    ToolbarItem(placement: .principal) { Restant(r: r) }
                }
            }
        }
        .task { await premiere() }
        .sensoryFeedback(.impact(weight: .light), trigger: revele)
        .sensoryFeedback(trigger: retour) { _, _ in .selection }
    }

    @ViewBuilder
    private func contenu(_ c: CarteRendue) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: Espace.l) {
                    HStack(spacing: Espace.s) {
                        if c.nouvelle { PastilleMatiere(nom: "Nouvelle", couleur: "indigo") }
                        if session.paquet == nil { Text(c.paquet).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                        Spacer()
                        if c.signalee { Label("Signalée", systemImage: "flag.fill").font(.caption).foregroundStyle(.orange) }
                    }
                    CarteHTML(html: revele && !plusieursTrous ? c.rectoReveleHtml : c.rectoHtml, trousOuverts: trousOuverts)
                    if revele && !c.versoHtml.isEmpty {
                        Divider()
                        CarteHTML(html: c.versoHtml)
                            .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
                .padding(Espace.xl)
                .carte(marge: 0)
                .padding(Espace.l)
                .contentShape(.rect)
                .onTapGesture { avancer() }
            }

            VStack(spacing: Espace.s) {
                if let erreur {
                    Text(erreur).font(.subheadline).foregroundStyle(.red).multilineTextAlignment(.center)
                }
                if revele {
                    Notes(notes: c.apercu, envoi: envoi) { cle in Task { await noter(cle) } }
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                } else {
                    Button(plusieursTrous ? "Ouvrir un trou" : "Afficher la réponse") { avancer() }
                        .buttonStyle(BoutonPrincipal())
                    if plusieursTrous {
                        Button("Tout afficher") { toutAfficher() }.font(.subheadline)
                    }
                }
            }
            .padding(.horizontal, Espace.l)
            .padding(.bottom, Espace.s)
            .animation(.snappy(duration: 0.25), value: revele)
        }
    }

    // MARK: Logique

    private func avancer() {
        guard let c = carte, !revele else { return }
        if plusieursTrous {
            let fermes = c.trousHtml.indices.filter { trousOuverts[$0] == nil }
            if let i = fermes.randomElement() {
                trousOuverts[i] = c.trousHtml[i]
                retour += 1
            }
            if fermes.count <= 1 { reveler() }
        } else {
            reveler()
        }
    }

    private func toutAfficher() {
        guard let c = carte else { return }
        for i in c.trousHtml.indices where trousOuverts[i] == nil { trousOuverts[i] = c.trousHtml[i] }
        reveler()
    }

    private func reveler() {
        withAnimation(.snappy(duration: 0.25)) { revele = true }
        guard let c = carte else { return }
        let api = app.api
        let paquet = session.paquet
        prechargee = Task { try await Self.suivante(api, paquet: paquet, exclure: [c.cardId]) }
    }

    private func premiere() async {
        do {
            afficher(try await Self.suivante(app.api, paquet: session.paquet, exclure: []))
        } catch {
            app.signaler(error)
            erreur = error.localizedDescription
            chargement = false
        }
    }

    /// La note part en arrière-plan : la carte suivante (déjà préchargée)
    /// s'affiche sans attendre le serveur. Si l'envoi échoue, la carte n'est
    /// pas perdue : elle reste due et reviendra ; on le dit simplement.
    private func noter(_ cle: String) async {
        guard let c = carte, !envoi else { return }
        envoi = true
        defer { envoi = false }
        let api = app.api
        let corps: [String: Any?] = [
            "carte": c.cardId, "note": cle, "jeton": c.jeton,
            "dureeMs": Int(Date.now.timeIntervalSince(debut) * 1000),
        ]
        let envoiNote = Task { () async throws -> Void in
            let _: ResultatRevision = try await api.envoyer("POST", "api/app/revision", corps)
        }
        revisees += 1
        retour += 1

        if let prechargee, let suivante = try? await prechargee.value {
            afficher(suivante)
            Task { await verifier(envoiNote) }
            return
        }
        // Rien de préchargé (ou fin de paquet) : on attend la note pour demander la suite.
        await verifier(envoiNote)
        do {
            afficher(try await Self.suivante(api, paquet: session.paquet, exclure: []))
        } catch {
            app.signaler(error)
            erreur = error.localizedDescription
        }
    }

    private func verifier(_ envoiNote: Task<Void, Error>) async {
        do {
            try await envoiNote.value
        } catch let e as ErreurAPI where e.statut == 400 && e.message.contains("déjà été révisée") {
            // Révisée ailleurs entre-temps : rien à signaler.
        } catch {
            app.signaler(error)
            revisees = max(0, revisees - 1)
            erreur = "Une note n’a pas été enregistrée (\(error.localizedDescription)). La carte reviendra plus tard."
        }
    }

    private func afficher(_ c: CarteRendue?) {
        prechargee = nil
        erreur = nil
        trousOuverts = [:]
        revele = false
        debut = .now
        chargement = false
        carte = c
    }

    private static func suivante(_ api: API, paquet: Int?, exclure: [Int]) async throws -> CarteRendue? {
        let r: ReponseCarte = try await api.envoyer("POST", "api/app/revision/suivante",
                                                    ["paquet": paquet, "exclure": exclure])
        return r.carte
    }
}

/// Les quatre notes, avec l'intervalle calculé par le serveur au-dessus.
private struct Notes: View {
    let notes: [CarteRendue.Note]
    let envoi: Bool
    let noter: (String) -> Void

    private func couleur(_ cle: String) -> Color {
        switch cle {
        case "again": .red
        case "hard": .orange
        case "good": .green
        default: .accent
        }
    }

    var body: some View {
        HStack(spacing: Espace.s) {
            ForEach(notes) { n in
                Button { noter(n.cle) } label: {
                    VStack(spacing: 2) {
                        Text(n.intervalle).font(.caption).monospacedDigit().opacity(0.85)
                        Text(n.label).font(.subheadline.weight(.semibold))
                    }
                    .foregroundStyle(couleur(n.cle))
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .background(couleur(n.cle).opacity(0.12), in: .rect(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(n.label), revoir \(n.intervalle)")
            }
        }
        .disabled(envoi)
        .opacity(envoi ? 0.6 : 1)
    }
}

private struct Restant: View {
    let r: CarteRendue.Restant
    var body: some View {
        HStack(spacing: Espace.m) {
            Text("\(r.nouvelles)").foregroundStyle(Color.accent)
            Text("\(r.apprentissage)").foregroundStyle(.orange)
            Text("\(r.aRevoir)").foregroundStyle(.green)
        }
        .font(.subheadline.weight(.semibold))
        .monospacedDigit()
        .contentTransition(.numericText())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(r.nouvelles) nouvelles, \(r.apprentissage) en apprentissage, \(r.aRevoir) à revoir")
    }
}

/// Fin de session : ce qui a été fait, et un mot pour revenir.
private struct Fin: View {
    let revisees: Int
    let duree: TimeInterval
    let fermer: () -> Void
    @State private var visible = false

    var body: some View {
        VStack(spacing: Espace.xl) {
            Spacer()
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 72))
                .foregroundStyle(.green)
                .symbolEffect(.bounce, value: visible)
                .shadow(color: .green.opacity(0.3), radius: 24)
            VStack(spacing: Espace.s) {
                Text(revisees > 0 ? "Session terminée" : "Rien à réviser").font(.title2.weight(.semibold))
                Text(revisees > 0
                     ? "\(revisees) carte\(revisees > 1 ? "s" : "") en \(Int(max(1, duree / 60).rounded())) min. Les prochaines reviendront au bon moment."
                     : "Toutes les cartes de ce paquet sont à jour.")
                    .font(.body).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            Spacer()
            Button("Terminer", action: fermer).buttonStyle(BoutonPrincipal())
        }
        .padding(Espace.xl)
        .sensoryFeedback(.success, trigger: visible)
        .onAppear { visible = true }
    }
}
