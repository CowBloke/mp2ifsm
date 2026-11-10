import SwiftUI

/*
 * Fiche d'un paquet, comme `/fiches/<slug>` : réviser, suivre, aimer,
 * statistiques personnelles, puis les cartes. Tout membre ajoute ou
 * corrige une carte (chaque correction reste dans l'historique) ; le
 * créateur du paquet ou un admin le renomme et le reclasse ; l'auteur
 * d'une carte ou un admin la supprime.
 * L'en-tête s'affiche tout de suite avec le paquet de la liste, la fiche
 * complète arrive ensuite.
 */
struct PaquetDetail: View {
    let initial: Paquet
    let reviser: (SessionRevision) -> Void
    let apres: () async -> Void

    @Environment(Session.self) private var session
    @State private var fiche: FichePaquet?
    /// Aperçus texte des cartes, calculés une fois par chargement (pas à chaque frappe du filtre).
    @State private var lignes: [LigneResumee] = []
    /// Suivi et j'aime affichés tout de suite, avant la réponse du serveur.
    @State private var abonneLocal: Bool?
    @State private var aimeLocal: (aime: Bool, likes: Int)?
    @State private var erreur: String?
    @State private var ajout = false
    @State private var modification = false
    @State private var carteOuverte: CarteListe?
    @State private var filtre = ""

    private var paquet: Paquet {
        var p = fiche?.paquet ?? initial
        if let abonneLocal { p.abonne = abonneLocal }
        if let aimeLocal { p.aime = aimeLocal.aime; p.likes = aimeLocal.likes }
        return p
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Espace.xl) {
                entete
                actions
                if let s = fiche?.stats { Statistiques(stats: s) }
                cartes
            }
            .padding(Espace.l)
        }
        .background(Color.fond)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if fiche?.peutModifier == true {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Modifier") { modification = true }
                }
            }
        }
        .task { await charger() }
        .refreshable { await charger() }
        .sheet(isPresented: $ajout) {
            EditeurCarteVue(mode: .ajout(paquet: paquet.id)) { await toutRecharger() }
        }
        .sheet(isPresented: $modification) {
            if let fiche {
                FormulairePaquet(existant: fiche.paquet, matieres: fiche.matieres) { _ in await toutRecharger() }
            }
        }
        .sheet(item: $carteOuverte) { c in
            DetailCarteVue(carte: c) { await toutRecharger() }
        }
    }

    // MARK: Sections

    private var entete: some View {
        VStack(alignment: .leading, spacing: Espace.s) {
            if let m = paquet.matiere { PastilleMatiere(nom: m, couleur: paquet.couleur) }
            Text(paquet.titre).font(.title2.weight(.semibold))
            Text("par \(paquet.createur)").font(.subheadline).foregroundStyle(.secondary)
            if let d = paquet.description, !d.isEmpty { Text(d).font(.body).padding(.top, Espace.xs) }
        }
    }

    private var actions: some View {
        VStack(alignment: .leading, spacing: Espace.l) {
            if paquet.abonne {
                Button { reviser(SessionRevision(paquet: paquet.id, titre: paquet.titre)) } label: {
                    Text(paquet.aFaire > 0 ? "Réviser \(paquet.aFaire) carte\(paquet.aFaire > 1 ? "s" : "")"
                                           : "Rien à réviser pour l’instant")
                }
                .buttonStyle(BoutonPrincipal())
                .disabled(paquet.aFaire == 0)
            }
            HStack(spacing: Espace.m) {
                Button { Task { await suivre(!paquet.abonne) } } label: {
                    Label(paquet.abonne ? "Suivi" : "Suivre", systemImage: paquet.abonne ? "checkmark" : "plus")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .tint(paquet.abonne ? Color.secondary : Color.accent)
                Button { Task { await aimer(!paquet.aime) } } label: {
                    Label("\(paquet.likes)", systemImage: paquet.aime ? "heart.fill" : "heart")
                        .frame(minWidth: 72, minHeight: 44)
                        .contentTransition(.symbolEffect(.replace))
                }
                .buttonStyle(.bordered)
                .tint(paquet.aime ? Color.pink : Color.secondary)
            }
            .sensoryFeedback(.impact(weight: .light), trigger: paquet.aime)
            .sensoryFeedback(.success, trigger: paquet.abonne)

            if !paquet.abonne {
                Text("Suis ce paquet pour que ses cartes entrent dans tes révisions. Ta progression est gardée si tu arrêtes.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            if let erreur { Text(erreur).font(.subheadline).foregroundStyle(.red) }
        }
    }

    @ViewBuilder private var cartes: some View {
        VStack(alignment: .leading, spacing: Espace.m) {
            TitreSection(titre: "\(paquet.total) carte\(paquet.total > 1 ? "s" : "")")
            Button { ajout = true } label: {
                Label("Ajouter une carte", systemImage: "plus")
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 48)
            }
            .buttonStyle(.bordered)
            .tint(Color.accent)

            if fiche != nil {
                if lignes.count > 8 {
                    HStack {
                        Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                        TextField("Chercher dans les cartes", text: $filtre)
                    }
                    .padding(Espace.m)
                    .background(Color.surface, in: .rect(cornerRadius: Rayon.element, style: .continuous))
                }
                let visibles = filtre.isEmpty ? lignes : lignes.filter {
                    $0.recto.localizedStandardContains(filtre) || $0.verso.localizedStandardContains(filtre)
                }
                if lignes.isEmpty {
                    ContentUnavailableView("Aucune carte", systemImage: "rectangle.on.rectangle.slash",
                                           description: Text("Ajoute la première : elle profitera à toute la classe."))
                } else {
                    // Paresseux : seules les lignes à l'écran sont construites, même pour 500 cartes.
                    LazyVStack(spacing: 0) {
                        ForEach(visibles) { l in
                            if l.id != visibles.first?.id { Divider().padding(.leading, Espace.l) }
                            Button { carteOuverte = l.carte } label: { LigneCarte(ligne: l) }.buttonStyle(.plain)
                        }
                    }
                    .carte(marge: 0)
                    if visibles.isEmpty {
                        Text("Aucune carte ne contient « \(filtre) ».")
                            .font(.subheadline).foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity).padding(Espace.l)
                    }
                }
            } else if erreur == nil {
                ProgressView().frame(maxWidth: .infinity).padding(Espace.xl)
            }
        }
    }

    // MARK: Réseau

    private func charger() async {
        do {
            let f: FichePaquet = try await session.api.get("api/app/fiches/\(initial.id)")
            let l = f.cartes.map(LigneResumee.init)
            withAnimation(.smooth) {
                fiche = f
                lignes = l
                abonneLocal = nil
                aimeLocal = nil
            }
            erreur = nil
        } catch is CancellationError {
        } catch {
            session.signaler(error)
            erreur = error.localizedDescription
        }
    }

    private func toutRecharger() async {
        await charger()
        await apres()
    }

    /// Optimiste : le bouton change tout de suite ; on revient en arrière si le serveur refuse.
    private func suivre(_ oui: Bool) async {
        withAnimation(.snappy) { abonneLocal = oui }
        do {
            let _: ReponsePaquet = try await session.api.envoyer("PATCH", "api/app/fiches/\(paquet.id)", ["suivre": oui])
            erreur = nil
            await toutRecharger()      // cartes à réviser et statistiques changent
        } catch {
            session.signaler(error)
            withAnimation(.snappy) { abonneLocal = nil }
            erreur = error.localizedDescription
        }
    }

    private func aimer(_ oui: Bool) async {
        let likes = paquet.likes
        withAnimation(.snappy) { aimeLocal = (oui, max(0, likes + (oui ? 1 : -1))) }
        do {
            let r: ReponsePaquet = try await session.api.envoyer("PATCH", "api/app/fiches/\(paquet.id)", ["aime": oui])
            withAnimation(.snappy) { aimeLocal = (r.aime ?? oui, r.likes ?? likes) }
            erreur = nil
        } catch {
            session.signaler(error)
            withAnimation(.snappy) { aimeLocal = nil }
            erreur = error.localizedDescription
        }
    }
}

// MARK: Statistiques

private struct Statistiques: View {
    let stats: StatsPaquet

    var body: some View {
        VStack(alignment: .leading, spacing: Espace.l) {
            HStack(spacing: 0) {
                chiffre(stats.retention.map { "\(Int(($0 * 100).rounded())) %" } ?? "—", "rétention")
                Divider().frame(height: 32)
                chiffre("\(stats.cartesVues)/\(stats.total)", "cartes vues")
                Divider().frame(height: 32)
                chiffre("\(stats.revisions30j)", "sur 30 jours")
            }
            let max = Swift.max(1, stats.aVenir.map(\.n).max() ?? 0)
            VStack(alignment: .leading, spacing: Espace.s) {
                Text("À réviser cette semaine").font(.caption).foregroundStyle(.secondary)
                HStack(alignment: .bottom, spacing: Espace.s) {
                    ForEach(stats.aVenir) { j in
                        VStack(spacing: Espace.xs) {
                            Text(j.n > 0 ? "\(j.n)" : " ").font(.caption2).monospacedDigit().foregroundStyle(.secondary)
                            RoundedRectangle(cornerRadius: 4, style: .continuous)
                                .fill(Color.accent.opacity(j.n > 0 ? 1 : 0.18))
                                .frame(height: Swift.max(4, CGFloat(j.n) / CGFloat(max) * 56))
                            Text(Self.jour(j.jour)).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(stats.aVenir.map { "\(Self.jour($0.jour)) : \($0.n)" }.joined(separator: ", "))
            }
        }
        .carte()
    }

    private func chiffre(_ valeur: String, _ libelle: String) -> some View {
        VStack(spacing: 2) {
            Text(valeur).font(.title3.weight(.semibold)).monospacedDigit()
            Text(libelle).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    /// « 2026-11-10 » → initiale du jour (L, M, M…).
    private static func jour(_ iso: String) -> String {
        guard let d = try? Date(iso + "T12:00:00Z", strategy: .iso8601) else { return "" }
        return d.formatted(.dateTime.weekday(.narrow).locale(Locale(identifier: "fr_FR")))
    }
}

// MARK: Cartes

/// Aperçu texte d'une carte : trous dévoilés, images et LaTeX laissés lisibles.
private func resume(_ source: String) -> String {
    source
        .replacing(#/\{\{c\d+::(.*?)(?:::[^}]*)?\}\}/#) { String($0.output.1) }
        .replacing(#/!\[[^\]]*\]\([^)]*\)/#, with: "🖼")
        .replacing(#/\s+/#, with: " ")
        .trimmingCharacters(in: .whitespaces)
}

private struct LigneResumee: Identifiable {
    let carte: CarteListe
    let recto: String
    let verso: String
    var id: Int { carte.id }

    init(_ carte: CarteListe) {
        self.carte = carte
        recto = resume(carte.recto)
        let v = resume(carte.verso)
        verso = v == "(vide)" ? "" : v
    }
}

private struct LigneCarte: View {
    let ligne: LigneResumee

    var body: some View {
        HStack(alignment: .top, spacing: Espace.m) {
            VStack(alignment: .leading, spacing: Espace.xs) {
                Text(ligne.recto).font(.body).lineLimit(3)
                if !ligne.verso.isEmpty {
                    Text(ligne.verso).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                }
            }
            Spacer(minLength: Espace.s)
            if ligne.carte.signalements > 0 {
                Image(systemName: "flag.fill").font(.caption).foregroundStyle(.orange)
                    .accessibilityLabel("Signalée")
            }
        }
        .multilineTextAlignment(.leading)
        .padding(Espace.l)
        .contentShape(.rect)
    }
}

/// Une carte composée, et ce qu'on peut en faire.
private struct DetailCarteVue: View {
    let carte: CarteListe
    let apres: () async -> Void

    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var fermer
    @State private var correction = false
    @State private var signalement = false
    @State private var motif = ""
    @State private var suppression = false
    @State private var message: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Espace.l) {
                    VStack(alignment: .leading, spacing: Espace.m) {
                        CarteHTML(html: carte.rectoHtml)
                        if !carte.versoHtml.isEmpty {
                            Divider()
                            CarteHTML(html: carte.versoHtml)
                        }
                    }
                    .carte(marge: Espace.xl)

                    VStack(alignment: .leading, spacing: Espace.xs) {
                        Label("Ajoutée par \(carte.auteur)", systemImage: "person")
                        if carte.revisions > 1 {
                            Label("Corrigée \(carte.revisions - 1) fois", systemImage: "clock.arrow.circlepath")
                        }
                        if carte.signalements > 0 {
                            Label("\(carte.signalements) signalement\(carte.signalements > 1 ? "s" : "") en attente",
                                  systemImage: "flag").foregroundStyle(.orange)
                        }
                    }
                    .font(.subheadline).foregroundStyle(.secondary)

                    if let message { Text(message).font(.subheadline).foregroundStyle(.secondary) }

                    VStack(spacing: Espace.m) {
                        Button { correction = true } label: {
                            Label("Corriger", systemImage: "pencil").frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.bordered).tint(Color.accent)
                        if carte.revisions > 1 {
                            NavigationLink { HistoriqueCarteVue(carteId: carte.id) } label: {
                                Label("Historique", systemImage: "clock.arrow.circlepath").frame(maxWidth: .infinity, minHeight: 44)
                            }
                            .buttonStyle(.bordered).tint(.secondary)
                        }
                    }
                }
                .padding(Espace.l)
            }
            .background(Color.fond)
            .navigationTitle("Carte")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Fermer") { fermer() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Signaler une erreur", systemImage: "flag") { signalement = true }
                        if carte.peutSupprimer {
                            Button("Supprimer", systemImage: "trash", role: .destructive) { suppression = true }
                        }
                    } label: { Image(systemName: "ellipsis.circle") }
                }
            }
            .sheet(isPresented: $correction) {
                EditeurCarteVue(mode: .correction(carte)) {
                    await apres()
                    fermer()
                }
            }
            .alert("Signaler une erreur", isPresented: $signalement) {
                TextField("Qu’est-ce qui ne va pas ?", text: $motif)
                Button("Annuler", role: .cancel) { motif = "" }
                Button("Signaler") { Task { await signaler() } }
            } message: {
                Text("Le signalement est visible par la classe jusqu’à ce que la carte soit corrigée.")
            }
            .confirmationDialog("Supprimer cette carte ?", isPresented: $suppression, titleVisibility: .visible) {
                Button("Supprimer", role: .destructive) { Task { await supprimer() } }
            } message: {
                Text("Elle disparaît du paquet et des révisions de toute la classe.")
            }
            .sensoryFeedback(.success, trigger: message)
        }
    }

    private func signaler() async {
        do {
            try await session.api.envoyer("POST", "api/app/cartes/\(carte.id)/signalement", ["motif": motif])
            motif = ""
            message = "Merci, la carte est signalée."
            await apres()
        } catch {
            session.signaler(error)
            message = error.localizedDescription
        }
    }

    private func supprimer() async {
        do {
            try await session.api.envoyer("DELETE", "api/app/cartes/\(carte.id)")
            await apres()
            fermer()
        } catch {
            session.signaler(error)
            message = error.localizedDescription
        }
    }
}

private struct HistoriqueCarteVue: View {
    let carteId: Int

    var body: some View {
        Chargement(cle: carteId) { [carteId] api in
            try await api.get("api/app/cartes/\(carteId)/historique") as ReponseHistorique
        } contenu: { r, _ in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: Espace.l) {
                    ForEach(Array(r.versions.enumerated()), id: \.element.id) { i, v in
                        VStack(alignment: .leading, spacing: Espace.m) {
                            HStack {
                                Text(v.auteur).font(.subheadline.weight(.semibold))
                                if i == 0 { PastilleMatiere(nom: "Actuelle", couleur: "indigo") }
                                Spacer()
                                Text(v.editedAt.formatted(.relative(presentation: .named)))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            if let m = v.motif, !m.isEmpty {
                                Text("« \(m) »").font(.subheadline).foregroundStyle(.secondary)
                            }
                            CarteHTML(html: v.rectoHtml)
                            if !v.versoHtml.isEmpty {
                                Divider()
                                CarteHTML(html: v.versoHtml)
                            }
                        }
                        .carte()
                    }
                }
                .padding(Espace.l)
            }
        }
        .background(Color.fond)
        .navigationTitle("Historique")
    }
}

// MARK: Paquet : création et modification

struct FormulairePaquet: View {
    /// nil : nouveau paquet.
    let existant: Paquet?
    let matieres: [Matiere]
    /// Après succès ; reçoit l'id du paquet créé.
    let fini: (Int?) async -> Void

    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var fermer
    @State private var titre: String
    @State private var description: String
    @State private var matiere: Int?
    @State private var enCours = false
    @State private var erreur: String?

    init(existant: Paquet? = nil, matieres: [Matiere], fini: @escaping (Int?) async -> Void) {
        self.existant = existant
        self.matieres = matieres
        self.fini = fini
        _titre = State(initialValue: existant?.titre ?? "")
        _description = State(initialValue: existant?.description ?? "")
        _matiere = State(initialValue: existant?.subjectId)
    }

    private var proposees: [Matiere] {
        matieres.filter { $0.archivee != true || $0.id == existant?.subjectId }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Titre", text: $titre)
                    TextField("Description (facultatif)", text: $description, axis: .vertical)
                        .lineLimit(2...6)
                }
                Section {
                    Picker("Matière", selection: $matiere) {
                        Text("Sans matière").tag(Int?.none)
                        ForEach(proposees) { m in Text(m.nom).tag(Int?.some(m.id)) }
                    }
                } footer: {
                    if existant == nil {
                        Text("Tu suivras ce paquet. Toute la classe pourra y ajouter des cartes.")
                    }
                }
                if let erreur {
                    Section { Text(erreur).foregroundStyle(.red) }
                }
            }
            .navigationTitle(existant == nil ? "Nouveau paquet" : "Modifier le paquet")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { fermer() } }
                ToolbarItem(placement: .confirmationAction) {
                    if enCours { ProgressView() } else {
                        Button(existant == nil ? "Créer" : "Enregistrer") { Task { await enregistrer() } }
                            .disabled(titre.trimmingCharacters(in: .whitespaces).count < 2)
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func enregistrer() async {
        enCours = true
        defer { enCours = false }
        let corps: [String: Any?] = ["titre": titre, "description": description,
                                     "matiere": matiere.map(String.init) ?? ""]
        do {
            if let existant {
                try await session.api.envoyer("PATCH", "api/app/fiches/\(existant.id)", corps)
                await fini(existant.id)
            } else {
                let r: PaquetCree = try await session.api.envoyer("POST", "api/app/fiches", corps)
                await fini(r.id)
            }
            fermer()
        } catch {
            session.signaler(error)
            erreur = error.localizedDescription
        }
    }
}
