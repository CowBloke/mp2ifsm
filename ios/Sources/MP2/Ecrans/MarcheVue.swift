import SwiftUI

/*
 * Marché de prédiction de la classe (parimutuel, pricoupenkoins fictifs).
 * Aucun calcul d'argent ici : le serveur (place_bet, grand livre) fait foi ;
 * l'app n'affiche qu'une estimation pendant la saisie, puis le solde renvoyé.
 */
struct LienMarche: Hashable { let slug: String }

struct MarcheVue: View {
    @Environment(\.dismiss) private var fermer

    var body: some View {
        NavigationStack {
            Chargement({ try await $0.get("api/app/marche") as ReponseMarches }) { r, recharger in
                ListeMarches(r: r)
                    .refreshable { await recharger() }
                    .navigationDestination(for: LienMarche.self) { l in MarcheDetail(slug: l.slug) }
                    .navigationDestination(for: String.self) { _ in ClassementVue() }
            }
            .background(Color.fond)
            .navigationTitle("Marché")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("OK") { fermer() } } }
        }
    }
}

private struct ListeMarches: View {
    let r: ReponseMarches

    var body: some View {
        let ouverts = r.marches.filter(\.ouvert)
        let fermes = r.marches.filter { $0.status == "closed" }
        let resolus = r.marches.filter { $0.status == "resolved" }
        ScrollView {
            VStack(alignment: .leading, spacing: Espace.xxl) {
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: Espace.xs) {
                        Text(Montant.pck(r.solde))
                            .font(.system(size: 34, weight: .semibold, design: .rounded)).monospacedDigit()
                            .contentTransition(.numericText())
                        Text("ton solde").font(.subheadline).foregroundStyle(.secondary)
                    }
                    Spacer()
                    NavigationLink(value: "classement") {
                        Label("Classement", systemImage: "trophy.fill").font(.subheadline.weight(.semibold))
                    }
                    .buttonStyle(.bordered)
                }
                .carte()

                if !r.positions.isEmpty {
                    Bloc(titre: "Mes mises en cours", marches: []) {
                        ForEach(r.positions) { p in
                            NavigationLink(value: LienMarche(slug: p.slug)) {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(p.question).font(.subheadline).lineLimit(2).multilineTextAlignment(.leading)
                                        Text(p.outcomeLabel).font(.caption.weight(.semibold)).foregroundStyle(Color.accent)
                                    }
                                    Spacer()
                                    Text(Montant.pck(p.amount)).font(.subheadline.weight(.semibold)).monospacedDigit()
                                }
                                .padding(.horizontal, Espace.l).padding(.vertical, Espace.m).contentShape(.rect)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                if ouverts.isEmpty && fermes.isEmpty && resolus.isEmpty {
                    ContentUnavailableView("Aucun marché pour l’instant", systemImage: "chart.line.uptrend.xyaxis",
                                           description: Text("Propose une question à la classe depuis ton profil."))
                }
                if !ouverts.isEmpty { Bloc(titre: "Ouverts", marches: ouverts) }
                if !fermes.isEmpty { Bloc(titre: "En attente du résultat", marches: fermes) }
                if !resolus.isEmpty { Bloc(titre: "Résolus", marches: resolus) }
            }
            .padding(Espace.l)
        }
    }

    private struct Bloc<Extra: View>: View {
        let titre: String
        let marches: [Marche]
        @ViewBuilder var extra: Extra

        init(titre: String, marches: [Marche], @ViewBuilder extra: () -> Extra = { EmptyView() }) {
            self.titre = titre; self.marches = marches; self.extra = extra()
        }

        var body: some View {
            VStack(alignment: .leading, spacing: Espace.m) {
                TitreSection(titre: titre)
                VStack(spacing: 0) {
                    extra
                    ForEach(Array(marches.enumerated()), id: \.element.id) { i, m in
                        if i > 0 { Divider().padding(.leading, Espace.l) }
                        NavigationLink(value: LienMarche(slug: m.slug)) { LigneMarche(marche: m) }.buttonStyle(.plain)
                    }
                }
                .carte(marge: 0)
            }
        }
    }
}

private struct LigneMarche: View {
    let marche: Marche
    var body: some View {
        VStack(alignment: .leading, spacing: Espace.s) {
            Text(marche.question).font(.body).foregroundStyle(.primary).multilineTextAlignment(.leading)
            HStack(spacing: Espace.m) {
                Text(marche.ouvert ? "ferme \(marche.closesAt.dansCombienDeTemps)" : etat(marche))
                    .font(.caption).foregroundStyle(marche.ouvert ? Color.accent : .secondary)
                Text("\(Montant.pck(marche.cagnotte)) · \(marche.parieurs) parieur\(marche.parieurs > 1 ? "s" : "")")
                    .font(.caption).foregroundStyle(.secondary).monospacedDigit()
                Spacer()
                if marche.maMise > 0 { PastilleMatiere(nom: "Misé \(Montant.pck(marche.maMise))", couleur: "indigo") }
            }
        }
        .padding(.horizontal, Espace.l).padding(.vertical, Espace.m)
        .contentShape(.rect)
    }
}

private func etat(_ m: Marche) -> String {
    switch m.status {
    case "resolved": return "Résolu : \(m.issues.first { $0.id == m.resolvedOutcomeId }?.label ?? "—")"
    case "cancelled": return "Annulé, mises remboursées"
    default: return "Fermé, résultat bientôt"
    }
}

// MARK: Détail et mise

struct MarcheDetail: View {
    let slug: String
    @State private var mise: Marche.Issue?

    var body: some View {
        Chargement(cle: slug) { [slug] api in try await api.get("api/app/marche/\(slug)") as ReponseMarche } contenu: { r, recharger in
            let m = r.marche
            ScrollView {
                VStack(alignment: .leading, spacing: Espace.xl) {
                    VStack(alignment: .leading, spacing: Espace.s) {
                        Text(m.question).font(.title2.weight(.semibold))
                        if let d = m.description, !d.isEmpty { Text(d).font(.body).foregroundStyle(.secondary) }
                        Text(m.ouvert ? "Ferme \(m.closesAt.dansCombienDeTemps) · \(m.closesAt.jourCourt) à \(m.closesAt.heure)" : etat(m))
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(m.ouvert ? Color.accent : .secondary)
                    }
                    HStack(spacing: 0) {
                        Chiffre(valeur: Montant.pck(m.cagnotte), libelle: "cagnotte")
                        Divider().frame(height: 32)
                        Chiffre(valeur: "\(m.parieurs)", libelle: "parieurs")
                        Divider().frame(height: 32)
                        Chiffre(valeur: Montant.pck(m.maMise), libelle: "ma mise")
                    }
                    .carte()
                    if let g = m.monGain, m.status == "resolved" {
                        Label(g > 0 ? "Tu as gagné \(Montant.pck(g)) 🎉" : "Pas de gain sur ce marché",
                              systemImage: g > 0 ? "checkmark.seal.fill" : "xmark.seal")
                            .font(.body.weight(.semibold)).foregroundStyle(g > 0 ? .green : .secondary)
                    }
                    VStack(spacing: Espace.m) {
                        ForEach(m.issues) { i in
                            Button { if m.ouvert { mise = i } } label: { LigneIssue(issue: i, marche: m) }
                                .buttonStyle(.plain)
                                .disabled(!m.ouvert)
                        }
                    }
                    if m.ouvert {
                        Text("Toute la cagnotte va aux gagnants, au prorata de leur mise. Une mise est définitive.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
                .padding(Espace.l)
            }
            .refreshable { await recharger() }
            .sheet(item: $mise, onDismiss: { Task { await recharger() } }) { i in
                FeuilleMise(marche: m, issue: i, solde: r.solde).presentationDetents([.medium])
            }
        }
        .background(Color.fond)
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct LigneIssue: View {
    let issue: Marche.Issue
    let marche: Marche
    var body: some View {
        let part = marche.cagnotte > 0 ? Double(issue.mises) / Double(marche.cagnotte) : 0
        let gagnante = marche.resolvedOutcomeId == issue.id
        VStack(alignment: .leading, spacing: Espace.s) {
            HStack {
                Text(issue.label).font(.body.weight(.semibold))
                if gagnante { Image(systemName: "checkmark.circle.fill").foregroundStyle(.green) }
                Spacer()
                Text("\(Int((part * 100).rounded())) %").font(.body.weight(.semibold)).monospacedDigit()
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.accent.opacity(0.1))
                    Capsule().fill(gagnante ? Color.green : Color.accent).frame(width: max(6, g.size.width * part))
                }
            }
            .frame(height: 8)
            HStack {
                Text("\(Montant.pck(issue.mises)) · \(issue.parieurs) parieur\(issue.parieurs > 1 ? "s" : "")")
                Spacer()
                if issue.maMise > 0 { Text("ma mise \(Montant.pck(issue.maMise))").foregroundStyle(Color.accent) }
            }
            .font(.caption).foregroundStyle(.secondary).monospacedDigit()
        }
        .carte()
        .animation(.smooth, value: part)
        .accessibilityElement(children: .combine)
        .accessibilityHint(marche.ouvert ? "Miser sur cette issue" : "")
    }
}

/// Feuille de mise. La clé d'idempotence est tirée à l'ouverture : renvoyer la même requête ne mise jamais deux fois.
private struct FeuilleMise: View {
    let marche: Marche
    let issue: Marche.Issue
    let solde: Int
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var fermer
    @State private var saisie = ""
    @State private var cle = UUID()
    @State private var envoi = false
    @State private var erreur: String?
    @State private var reussite: ResultatPari?
    @FocusState private var champ: Bool

    /// Centièmes saisis (« 1,5 » → 150), nil si illisible. L'interprétation qui fait foi est celle du serveur.
    private var centimes: Int? {
        let t = saisie.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)
        guard let v = Decimal(string: t), v > 0 else { return nil }
        return NSDecimalNumber(decimal: v * 100).intValue
    }

    /// Gain si l'issue l'emporte, avec les mises actuelles (estimation : d'autres mises peuvent arriver).
    private var estimation: Int? {
        guard let m = centimes else { return nil }
        return Int((Double(m) * Double(marche.cagnotte + m) / Double(issue.mises + m)).rounded(.down))
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: Espace.l) {
                if let r = reussite {
                    VStack(spacing: Espace.m) {
                        Image(systemName: "checkmark.seal.fill").font(.system(size: 56)).foregroundStyle(.green)
                            .symbolEffect(.bounce, value: r.betId)
                        Text("Mise de \(Montant.pck(r.miseCentimes)) sur « \(issue.label) »").font(.body.weight(.semibold))
                            .multilineTextAlignment(.center)
                        Text("Nouveau solde : \(Montant.pck(r.soldeCentimes))").font(.subheadline).foregroundStyle(.secondary)
                        Button("Terminé") { fermer() }.buttonStyle(BoutonPrincipal()).padding(.top, Espace.m)
                    }
                    .frame(maxWidth: .infinity)
                } else {
                    Text("Miser sur « \(issue.label) »").font(.title3.weight(.semibold))
                    HStack {
                        TextField("0,00", text: $saisie)
                            .keyboardType(.decimalPad)
                            .font(.system(size: 34, weight: .semibold, design: .rounded)).monospacedDigit()
                            .focused($champ)
                        Text("PCK").font(.title3.weight(.semibold)).foregroundStyle(.secondary)
                    }
                    .modifier(ChampSaisie())
                    HStack(spacing: Espace.s) {
                        ForEach([50, 100, 500], id: \.self) { c in
                            Button("+\(Montant.pck(c).replacingOccurrences(of: " PCK", with: ""))") { ajouter(c) }
                                .buttonStyle(.bordered)
                        }
                        Button("Tout") { saisie = format(solde) }.buttonStyle(.bordered)
                    }
                    .font(.subheadline.weight(.semibold))
                    Group {
                        if let e = estimation {
                            Text("Si « \(issue.label) » gagne : environ \(Montant.pck(e)) (estimation, selon les mises à venir).")
                        } else {
                            Text("Solde disponible : \(Montant.pck(solde)). Minimum 0,10 PCK.")
                        }
                    }
                    .font(.subheadline).foregroundStyle(.secondary)
                    if let erreur { Text(erreur).font(.subheadline).foregroundStyle(.red) }
                    Spacer()
                    Button(centimes.map { "Miser \(Montant.pck($0))" } ?? "Miser") { Task { await miser() } }
                        .buttonStyle(BoutonPrincipal(chargement: envoi))
                        .disabled(centimes == nil || envoi)
                }
            }
            .padding(Espace.l)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Annuler") { fermer() } } }
        }
        .onAppear { champ = true }
        .sensoryFeedback(.success, trigger: reussite?.betId)
        .interactiveDismissDisabled(envoi)
    }

    private func ajouter(_ c: Int) { saisie = format((centimes ?? 0) + c) }

    private func format(_ c: Int) -> String {
        (Decimal(c) / 100).formatted(.number.precision(.fractionLength(2)).grouping(.never).locale(Paris.langue))
    }

    private func miser() async {
        envoi = true
        defer { envoi = false }
        do {
            let r: ResultatPari = try await session.api.envoyer("POST", "api/app/marche/pari",
                ["issue": issue.id, "montant": saisie, "cle": cle.uuidString.lowercased()])
            withAnimation(.snappy) { reussite = r }
            erreur = nil
        } catch {
            session.signaler(error)
            erreur = error.localizedDescription
        }
    }
}

private struct Chiffre: View {
    let valeur: String
    let libelle: String
    var body: some View {
        VStack(spacing: 2) {
            Text(valeur).font(.body.weight(.semibold)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
            Text(libelle).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: Classement

private struct ClassementVue: View {
    @Environment(Session.self) private var session

    var body: some View {
        Chargement({ try await $0.get("api/app/marche/classement") as ReponseClassement }) { r, recharger in
            List {
                Section {
                    ForEach(Array(r.classement.enumerated()), id: \.element.id) { i, l in
                        HStack(spacing: Espace.m) {
                            Text(i < 3 ? ["🥇", "🥈", "🥉"][i] : "\(i + 1)").font(.body.weight(.semibold)).monospacedDigit().frame(width: 32)
                            Text(l.displayName).font(.body.weight(l.userId == session.utilisateur?.id ? .semibold : .regular))
                            Spacer()
                            Text(signe(l.resultat)).font(.body.weight(.semibold)).monospacedDigit()
                                .foregroundStyle(l.resultat >= 0 ? Color.green : Color.red)
                        }
                    }
                } header: { Text("Classement") } footer: {
                    Text("Résultat net : ce que tu as gagné ou perdu en pariant. Déposer plus ne fait pas monter.")
                }
                if !r.reglees.isEmpty {
                    Section("Mes paris réglés") {
                        ForEach(r.reglees) { p in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(p.question).font(.subheadline).lineLimit(2)
                                    Text(p.outcomeLabel).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(p.status == "cancelled" ? "remboursé" : p.gagnant == true ? "+\(Montant.pck(p.payout ?? 0))" : "−\(Montant.pck(p.amount))")
                                    .font(.subheadline.weight(.semibold)).monospacedDigit()
                                    .foregroundStyle(p.gagnant == true ? Color.green : .secondary)
                            }
                        }
                    }
                }
                if !r.mouvements.isEmpty {
                    Section("Mon relevé") {
                        ForEach(r.mouvements) { m in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(m.question ?? m.memo ?? m.kind).font(.subheadline).lineLimit(1)
                                    Text(m.createdAt.jourCourt).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(signe(m.amount)).font(.subheadline.weight(.semibold)).monospacedDigit()
                            }
                        }
                    }
                }
            }
            .refreshable { await recharger() }
        }
        .navigationTitle("Classement")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func signe(_ c: Int) -> String { c > 0 ? "+\(Montant.pck(c))" : c < 0 ? "−\(Montant.pck(-c))" : Montant.pck(0) }
}
