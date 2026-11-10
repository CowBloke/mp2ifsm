import SwiftUI

/*
 * Profil, comme `/profil` : portefeuille (solde, transferts kcmaths,
 * paris, relevé), réglages (groupe de colles, notifications, partage des
 * révisions), retours aux administrateurs et propositions de paris.
 */
struct ProfilVue: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var fermer
    @State private var confirmer = false

    var body: some View {
        NavigationStack {
            Chargement({ try await $0.get("api/app/profil") as ReponseProfil }) { r, recharger in
                ContenuProfil(r: r, recharger: recharger, deconnecter: { confirmer = true })
                    .refreshable { await recharger() }
            }
            .navigationTitle("Profil")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("OK") { fermer() } } }
            .confirmationDialog("Se déconnecter de ce téléphone ?", isPresented: $confirmer, titleVisibility: .visible) {
                Button("Se déconnecter", role: .destructive) { Task { await session.deconnexion() } }
            }
        }
    }
}

private struct ContenuProfil: View {
    let r: ReponseProfil
    let recharger: () async -> Void
    let deconnecter: () -> Void

    @Environment(Session.self) private var session
    @State private var transfert: String?          // "depot" | "retrait"
    @State private var retour = false
    @State private var proposition = false
    @State private var partage: Bool
    @State private var erreur: String?

    init(r: ReponseProfil, recharger: @escaping () async -> Void, deconnecter: @escaping () -> Void) {
        self.r = r
        self.recharger = recharger
        self.deconnecter = deconnecter
        _partage = State(initialValue: r.partageStats)
    }

    var body: some View {
        List {
            if let u = session.utilisateur {
                Section {
                    HStack(spacing: Espace.l) {
                        Avatar(utilisateur: u, taille: 56)
                        VStack(alignment: .leading, spacing: Espace.xs) {
                            Text(u.displayName).font(.title3.weight(.semibold))
                            if let email = u.email { Text(email).font(.subheadline).foregroundStyle(.secondary) }
                            if u.estAdmin { PastilleMatiere(nom: "Administrateur", couleur: "indigo") }
                        }
                    }
                    .padding(.vertical, Espace.xs)
                }
            }

            Section { portefeuille }

            if !r.positions.ouvertes.isEmpty {
                Section("Paris en cours") {
                    ForEach(r.positions.ouvertes) { p in
                        LignePari(p: p, montant: Montant.pck(p.amount), couleur: .primary)
                    }
                }
            }
            if !r.positions.reglees.isEmpty {
                Section("Paris terminés") {
                    ForEach(r.positions.reglees) { p in
                        let net = (p.payout ?? 0) - p.amount
                        LignePari(p: p, montant: (net >= 0 ? "+" : "") + Montant.pck(net), couleur: net >= 0 ? .green : .red)
                    }
                }
            }
            if !r.releve.isEmpty {
                Section {
                    DisclosureGroup("Relevé du compte") {
                        ForEach(Array(r.releve.enumerated()), id: \.offset) { _, m in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(m.libelle).font(.subheadline).lineLimit(1)
                                    Text(m.createdAt.formatted(.dateTime.day().month().hour().minute().locale(Paris.langue)))
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text((m.amount >= 0 ? "+" : "") + Montant.pck(m.amount))
                                    .font(.subheadline.weight(.semibold)).monospacedDigit()
                                    .foregroundStyle(m.amount >= 0 ? Color.green : Color.primary)
                            }
                        }
                    }
                }
            }

            Section("Colles") {
                Picker("Groupe", selection: Binding(
                    get: { session.utilisateur?.groupeColle },
                    set: { g in if let g { Task { await changerGroupe(g) } } })) {
                    if session.utilisateur?.groupeColle == nil { Text("Non indiqué").tag(Int?.none) }
                    ForEach(1...max(r.groupeMax, 1), id: \.self) { g in Text("Groupe \(g)").tag(Int?.some(g)) }
                }
            }

            ReglagesNotifs()

            Section {
                Toggle("Partager mes révisions avec la classe", isOn: $partage)
                    .onChange(of: partage) { _, v in Task { await partager(v) } }
            } footer: {
                Text("Désactivé, tu n’apparais dans aucune heatmap de paquet : le filtre est appliqué par le serveur.")
            }

            Section {
                Button { retour = true } label: { Label("Envoyer une idée ou un bug", systemImage: "bubble.left.and.exclamationmark.bubble.right") }
                ForEach(r.retours) { f in
                    VStack(alignment: .leading, spacing: Espace.xs) {
                        HStack(spacing: Espace.s) {
                            BadgeStatut(statut: f.statut)
                            Text(["idee": "Idée", "bug": "Bug", "autre": "Autre"][f.categorie] ?? f.categorie)
                                .font(.caption.weight(.semibold))
                            Spacer()
                            Text(f.createdAt.formatted(date: .abbreviated, time: .omitted)).font(.caption).foregroundStyle(.secondary)
                        }
                        Text(f.message).font(.subheadline).lineLimit(3)
                        if !f.reponse.isEmpty {
                            Text(f.reponse).font(.footnote).foregroundStyle(.secondary)
                                .padding(.leading, Espace.s)
                                .overlay(alignment: .leading) { Rectangle().fill(Color.accent).frame(width: 2) }
                        }
                    }
                    .padding(.vertical, Espace.xs)
                }
            } header: { Text("Retours") }

            Section {
                Button { proposition = true } label: { Label("Proposer un pari à la classe", systemImage: "plus.bubble") }
                ForEach(r.propositions) { p in
                    VStack(alignment: .leading, spacing: Espace.xs) {
                        HStack {
                            Text(p.question).font(.subheadline).lineLimit(2)
                            Spacer()
                            BadgeStatut(statut: p.status)
                        }
                        Text(p.issues.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        if let n = p.reviewNote, !n.isEmpty { Text(n).font(.footnote).foregroundStyle(.secondary) }
                    }
                    .padding(.vertical, Espace.xs)
                }
            } header: { Text("Propositions de paris") } footer: {
                Text("Un administrateur l’examine ; acceptée, elle devient un marché ouvert à toute la classe.")
            }

            if let erreur { Section { Text(erreur).foregroundStyle(.red) } }

            Section { Button("Se déconnecter", role: .destructive, action: deconnecter) }
        }
        .sheet(item: Binding(get: { transfert.map(Sens.init) }, set: { transfert = $0?.id })) { s in
            FeuilleTransfert(sens: s.id, portefeuille: r.portefeuille) { await recharger() }
                .presentationDetents([.medium])
        }
        .sheet(isPresented: $retour) { FormulaireRetour { await recharger() } }
        .sheet(isPresented: $proposition) { FormulaireProposition { await recharger() } }
    }

    private struct Sens: Identifiable { let id: String }

    private var portefeuille: some View {
        VStack(spacing: Espace.l) {
            VStack(spacing: Espace.xs) {
                Text(Montant.pck(r.portefeuille.solde))
                    .font(.system(size: 40, weight: .semibold, design: .rounded)).monospacedDigit()
                    .contentTransition(.numericText())
                Text("ton solde").font(.subheadline).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, Espace.s)
            if r.portefeuille.transferts {
                HStack(spacing: Espace.m) {
                    Button { transfert = "depot" } label: {
                        Label("Déposer", systemImage: "arrow.down.circle.fill").frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent).tint(Color.accent)
                    Button { transfert = "retrait" } label: {
                        Label("Retirer", systemImage: "arrow.up.circle").frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered).tint(Color.accent)
                    .disabled(r.portefeuille.kcRetirables <= 0)
                }
            }
            ForEach(r.portefeuille.enAttente, id: \.self) { t in
                Label("\(t.sens == "depot" ? "Dépôt" : "Retrait") de \(t.montant) KC en attente de kcmaths", systemImage: "clock")
                    .font(.footnote).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.vertical, Espace.s)
        .buttonStyle(.borderless)
    }

    private func changerGroupe(_ g: Int) async {
        do {
            try await session.api.envoyer("PUT", "api/app/groupe", ["groupe": g])
            session.groupeChange(g)
            erreur = nil
        } catch {
            session.signaler(error)
            erreur = error.localizedDescription
        }
    }

    private func partager(_ actif: Bool) async {
        guard actif != r.partageStats else { return }
        do {
            try await session.api.envoyer("PATCH", "api/app/profil", ["partageStats": actif])
            await recharger()
        } catch {
            session.signaler(error)
            erreur = error.localizedDescription
            partage = r.partageStats
        }
    }
}

private struct LignePari: View {
    let p: PositionMarche
    let montant: String
    let couleur: Color
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(p.question).font(.subheadline).lineLimit(2)
                Text(p.outcomeLabel).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text(montant).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(couleur)
        }
    }
}

private struct BadgeStatut: View {
    let statut: String
    var body: some View {
        let (nom, couleur): (String, String) = switch statut {
        case "ouvert", "pending": ("En attente", "ambre")
        case "prevu": ("Prévu", "bleu")
        case "termine", "approved": (statut == "approved" ? "Acceptée" : "Terminé", "vert")
        case "refuse", "rejected": (statut == "rejected" ? "Refusée" : "Refusé", "rouge")
        default: (statut, "indigo")
        }
        PastilleMatiere(nom: nom, couleur: couleur)
    }
}

// MARK: Transferts kcmaths

private struct FeuilleTransfert: View {
    let sens: String
    let portefeuille: ReponseProfil.Portefeuille
    let fini: () async -> Void

    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var fermer
    /// Tirée à l'ouverture : un double envoi ne transfère jamais deux fois.
    @State private var cle = UUID().uuidString.lowercased()
    @State private var saisie = ""
    @State private var enCours = false
    @State private var erreur: String?
    @State private var resultat: String?
    @FocusState private var focus: Bool

    private var depot: Bool { sens == "depot" }
    private var kc: Int? {
        let t = saisie.filter { !$0.isWhitespace }
        guard !t.isEmpty, t.allSatisfy(\.isNumber), let n = Int(t), n > 0 else { return nil }
        return n
    }
    private var tropCher: Bool { !depot && (kc ?? 0) > portefeuille.kcRetirables }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: Espace.l) {
                if let resultat {
                    Label(resultat, systemImage: "checkmark.circle.fill")
                        .font(.body.weight(.semibold)).foregroundStyle(.green)
                    Spacer()
                    Button("OK") { fermer() }.buttonStyle(BoutonPrincipal())
                } else {
                    Text(depot ? "Les KC coins quittent ton compte kcmaths et arrivent ici en PCK (1 KC = 1 PCK)."
                               : "Tes PCK repartent sur kcmaths en KC coins entiers (1 PCK = 1 KC).")
                        .font(.subheadline).foregroundStyle(.secondary)
                    HStack {
                        TextField("0", text: $saisie)
                            .keyboardType(.numberPad).focused($focus)
                            .font(.system(size: 34, weight: .semibold, design: .rounded)).monospacedDigit()
                        if !depot {
                            Button("Tout") { saisie = String(portefeuille.kcRetirables) }.buttonStyle(.bordered)
                        }
                        Text("KC").font(.title2.weight(.semibold)).foregroundStyle(.secondary)
                    }
                    .padding(Espace.m)
                    .background(Color.surface, in: .rect(cornerRadius: Rayon.element, style: .continuous))
                    if !saisie.isEmpty && kc == nil {
                        Text("Nombre entier uniquement").font(.footnote).foregroundStyle(.red)
                    } else if tropCher {
                        Text("Tu peux renvoyer au plus \(portefeuille.kcRetirables) KC.").font(.footnote).foregroundStyle(.red)
                    }
                    if let erreur { Text(erreur).font(.footnote).foregroundStyle(.red) }
                    Spacer()
                    Button(depot ? "Déposer" : "Retirer") { Task { await valider() } }
                        .buttonStyle(BoutonPrincipal(chargement: enCours))
                        .disabled(kc == nil || tropCher || enCours)
                }
            }
            .padding(Espace.l)
            .navigationTitle(depot ? "Déposer depuis kcmaths" : "Renvoyer sur kcmaths")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Annuler") { fermer() } } }
            .onAppear { focus = true }
            .sensoryFeedback(.success, trigger: resultat)
        }
        .interactiveDismissDisabled(enCours)
    }

    private func valider() async {
        guard let kc else { return }
        enCours = true
        defer { enCours = false }
        do {
            let r: ResultatTransfert = try await session.api.envoyer("POST", "api/app/portefeuille",
                                                                    ["sens": sens, "montant": String(kc), "cle": cle])
            await fini()
            switch r.statut {
            case "refuse": erreur = r.motif ?? "Transfert refusé"
            case "effectue": resultat = "\(depot ? "Dépôt" : "Retrait") de \(kc) KC effectué"
            default: resultat = "\(depot ? "Dépôt" : "Retrait") de \(kc) KC en attente de kcmaths"
            }
        } catch {
            session.signaler(error)
            erreur = error.localizedDescription
        }
    }
}

// MARK: Retours et propositions

private struct FormulaireRetour: View {
    let fini: () async -> Void
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var fermer
    @State private var categorie = "idee"
    @State private var message = ""
    @State private var enCours = false
    @State private var erreur: String?

    var body: some View {
        NavigationStack {
            Form {
                Picker("Type", selection: $categorie) {
                    Text("Idée").tag("idee")
                    Text("Bug").tag("bug")
                    Text("Autre").tag("autre")
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
                Section {
                    TextField(categorie == "bug" ? "Ce qui ne marche pas, et comment le reproduire" : "Ton message",
                              text: $message, axis: .vertical)
                        .lineLimit(5...12)
                } footer: {
                    Text("Lu par les administrateurs. Tu suivras ici son statut et leur réponse.")
                }
                if let erreur { Section { Text(erreur).foregroundStyle(.red) } }
            }
            .navigationTitle("Retour")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { fermer() } }
                ToolbarItem(placement: .confirmationAction) {
                    if enCours { ProgressView() } else {
                        Button("Envoyer") { Task { await envoyer() } }
                            .disabled(message.trimmingCharacters(in: .whitespacesAndNewlines).count < 5)
                    }
                }
            }
        }
    }

    private func envoyer() async {
        enCours = true
        defer { enCours = false }
        do {
            try await session.api.envoyer("POST", "api/app/retours", ["categorie": categorie, "message": message])
            await fini()
            fermer()
        } catch {
            session.signaler(error)
            erreur = error.localizedDescription
        }
    }
}

struct FormulaireProposition: View {
    let fini: () async -> Void
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var fermer
    @State private var question = ""
    @State private var description = ""
    @State private var fermeture = Calendar.current.date(byAdding: .day, value: 7, to: .now) ?? .now
    @State private var issues = ["Oui", "Non"]
    @State private var enCours = false
    @State private var erreur: String?

    private var issuesRemplies: [String] {
        issues.map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }
    private var pret: Bool {
        question.trimmingCharacters(in: .whitespaces).count >= 8
            && !description.trimmingCharacters(in: .whitespaces).isEmpty
            && issuesRemplies.count >= 2 && fermeture > .now
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("La question (ex. « Le DS sera-t-il rendu avant vendredi ? »)", text: $question, axis: .vertical)
                    TextField("Comment le pari sera tranché", text: $description, axis: .vertical).lineLimit(2...5)
                }
                Section("Issues") {
                    ForEach(issues.indices, id: \.self) { i in
                        TextField("Issue \(i + 1)", text: $issues[i])
                    }
                    .onDelete { if issues.count > 2 { issues.remove(atOffsets: $0) } }
                    if issues.count < 10 {
                        Button { issues.append("") } label: { Label("Ajouter une issue", systemImage: "plus") }
                    }
                }
                Section {
                    DatePicker("Fermeture", selection: $fermeture, in: Date.now..., displayedComponents: [.date, .hourAndMinute])
                }
                if let erreur { Section { Text(erreur).foregroundStyle(.red) } }
            }
            .navigationTitle("Proposer un pari")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { fermer() } }
                ToolbarItem(placement: .confirmationAction) {
                    if enCours { ProgressView() } else {
                        Button("Proposer") { Task { await envoyer() } }.disabled(!pret)
                    }
                }
            }
        }
    }

    private func envoyer() async {
        enCours = true
        defer { enCours = false }
        do {
            try await session.api.envoyer("POST", "api/app/propositions", [
                "question": question, "description": description,
                "closesAt": fermeture.ISO8601Format(), "issues": issuesRemplies,
            ])
            await fini()
            fermer()
        } catch {
            session.signaler(error)
            erreur = error.localizedDescription
        }
    }
}

/// Initiale sur fond d'accent doux (pas encore de photo de profil côté serveur).
struct Avatar: View {
    let utilisateur: Utilisateur
    var taille: CGFloat = 36

    var body: some View {
        Text(utilisateur.initiale.isEmpty ? "?" : utilisateur.initiale)
            .font(.system(size: taille * 0.42, weight: .semibold, design: .rounded))
            .foregroundStyle(Color.accent)
            .frame(width: taille, height: taille)
            .background(Color.accent.opacity(0.14), in: .circle)
            .accessibilityLabel("Profil de \(utilisateur.displayName)")
    }
}
