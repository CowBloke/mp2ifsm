import SwiftUI

/*
 * Accueil : la semaine d'abord (colles du groupe et échéances de la
 * classe, sur sept jours, en une liste), puis les révisions et le marché
 * qui ferme le plus tôt. Mêmes données que la page `/` du site.
 */
struct AccueilVue: View {
    @Binding var onglet: Onglet
    @Environment(Session.self) private var session
    @State private var profil = false
    @State private var edition: EditionEcheance?
    @State private var revision: SessionRevision?

    var body: some View {
        NavigationStack {
            Chargement({ try await $0.get("api/app/accueil") as Accueil }) { accueil, recharger in
                ScrollView {
                    VStack(alignment: .leading, spacing: Espace.xxl) {
                        InvitationNotifs()
                        if !accueil.message.texte.isEmpty { CarteMessage(message: accueil.message) }
                        Semaine(accueil: accueil, onglet: $onglet, edition: $edition)
                        Revisions(fiches: accueil.fiches,
                                  reviser: { revision = SessionRevision(paquet: nil, titre: "Paquets suivis") },
                                  voirFiches: { onglet = .fiches })
                        if let m = accueil.marche { CarteMarche(marche: m) }
                    }
                    .padding(.horizontal, Espace.l)
                    .padding(.vertical, Espace.s)
                }
                .refreshable { await recharger() }
                .onAppear { session.mettreAJour(accueil.utilisateur) }
                .onChange(of: accueil.utilisateur) { _, u in session.mettreAJour(u) }
                .sheet(item: $edition) { e in
                    EcheanceFormulaire(edition: e, matieres: accueil.matieres) { await recharger() }
                }
                .fullScreenCover(item: $revision, onDismiss: { Task { await recharger() } }) { RevisionVue(session: $0) }
            }
            .background(Color.fond)
            .navigationDestination(for: LienMarche.self) { MarcheDetail(slug: $0.slug) }
            .navigationTitle(salutation)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    if let u = session.utilisateur {
                        Button { profil = true } label: { Avatar(utilisateur: u) }
                    }
                }
            }
            .sheet(isPresented: $profil) { ProfilVue() }
        }
    }

    private var salutation: String {
        let h = Paris.calendrier.component(.hour, from: .now)
        let mot = h < 5 ? "Bonne nuit" : h < 18 ? "Bonjour" : "Bonsoir"
        guard let nom = session.utilisateur?.displayName else { return mot }
        return "\(mot), \(nom)"
    }
}

// MARK: Message de la classe

private struct CarteMessage: View {
    let message: MessageClasse

    var body: some View {
        HStack(alignment: .top, spacing: Espace.m) {
            Image(systemName: "megaphone.fill")
                .font(.body)
                .foregroundStyle(Color.accent)
                .frame(width: 32, height: 32)
                .background(Color.accent.opacity(0.12), in: .circle)
            VStack(alignment: .leading, spacing: Espace.xs) {
                Text(message.texte).font(.body)
                if let auteur = message.auteur {
                    Text(message.updatedAt.map { "\(auteur) · \($0.jourRelatif)" } ?? auteur)
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .carte()
        .accessibilityElement(children: .combine)
    }
}

// MARK: La semaine

private struct LigneSemaine: Identifiable {
    let id: String
    let titre: String
    let quand: Date
    let couleur: String?
    let estColle: Bool
    let echeance: Echeance?
}

private struct Semaine: View {
    let accueil: Accueil
    @Binding var onglet: Onglet
    @Binding var edition: EditionEcheance?

    private var lignes: [LigneSemaine] {
        let horizon = Date.now.addingTimeInterval(7 * 86_400)
        let colles = accueil.colles.map {
            LigneSemaine(id: "c\($0.id)", titre: "Colle \(deMatiere($0.matiere))", quand: $0.debut,
                         couleur: $0.couleur, estColle: true, echeance: nil)
        }
        let echeances = accueil.echeances.filter { $0.dueAt <= horizon }.map {
            LigneSemaine(id: "e\($0.id)", titre: $0.titre, quand: $0.dueAt,
                         couleur: $0.couleur, estColle: false, echeance: $0)
        }
        return Array((colles + echeances).sorted { $0.quand < $1.quand }.prefix(8))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Espace.m) {
            TitreSection(titre: "Cette semaine")

            VStack(spacing: 0) {
                if accueil.utilisateur.groupeColle == nil {
                    Button { onglet = .colles } label: {
                        Ligne(icone: "person.2.fill", titre: "Indiquer mon groupe de colle", chevron: true)
                    }
                    Divider().padding(.leading, 56)
                }
                if lignes.isEmpty {
                    VStack(spacing: Espace.xs) {
                        Text("Rien de prévu 🎉").font(.body.weight(.semibold))
                        Text("Aucune colle ni échéance dans les sept prochains jours.")
                            .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, Espace.xl)
                } else {
                    ForEach(Array(lignes.enumerated()), id: \.element.id) { i, l in
                        if i > 0 { Divider().padding(.leading, 56) }
                        if let e = l.echeance {
                            Button { edition = .modifier(e) } label: { LigneEvenement(ligne: l, premiere: i == 0) }
                                .accessibilityHint("Modifier l’échéance")
                        } else {
                            LigneEvenement(ligne: l, premiere: i == 0)
                        }
                    }
                }
                Divider().padding(.leading, 56)
                Button { edition = .nouvelle } label: {
                    Ligne(icone: "plus", titre: "Ajouter une échéance", accent: true)
                }
            }
            .buttonStyle(.plain)
            .carte(marge: 0)
        }
    }
}

private struct LigneEvenement: View {
    let ligne: LigneSemaine
    let premiere: Bool

    var body: some View {
        HStack(spacing: Espace.m) {
            Image(systemName: ligne.estColle ? "person.2.fill" : "flag.fill")
                .font(.subheadline)
                .foregroundStyle(Color.matiere(ligne.couleur))
                .frame(width: 32, height: 32)
                .background(Color.matiere(ligne.couleur).opacity(0.12), in: .circle)
            VStack(alignment: .leading, spacing: 2) {
                Text(ligne.titre).font(.body).foregroundStyle(.primary).multilineTextAlignment(.leading)
                if let m = ligne.echeance?.matiere { Text(m).font(.caption).foregroundStyle(.secondary) }
            }
            Spacer(minLength: Espace.s)
            VStack(alignment: .trailing, spacing: 2) {
                Text(ligne.quand.jourRelatif)
                    .font(.subheadline.weight(premiere ? .semibold : .regular))
                    .foregroundStyle(premiere ? Color.accent : .secondary)
                if ligne.estColle {
                    Text(ligne.quand.heure).font(.caption).monospacedDigit().foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal, Espace.l)
        .padding(.vertical, Espace.m)
        .contentShape(.rect)
    }
}

/// Ligne d'action d'une carte (icône ronde, titre, chevron facultatif).
struct Ligne: View {
    let icone: String
    let titre: String
    var chevron = false
    var accent = false

    var body: some View {
        HStack(spacing: Espace.m) {
            Image(systemName: icone)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.accent)
                .frame(width: 32, height: 32)
                .background(Color.accent.opacity(0.10), in: .circle)
            Text(titre).font(.body).foregroundStyle(accent ? Color.accent : .primary)
            Spacer()
            if chevron { Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary) }
        }
        .padding(.horizontal, Espace.l)
        .padding(.vertical, Espace.m)
        .contentShape(.rect)
    }
}

// MARK: Révisions et marché

private struct Revisions: View {
    let fiches: ResumeFiches
    let reviser: () -> Void
    let voirFiches: () -> Void

    var body: some View {
        Button {
            fiches.total > 0 ? reviser() : voirFiches()
        } label: {
            HStack(spacing: Espace.l) {
                if fiches.total > 0 {
                    VStack(alignment: .leading, spacing: Espace.xs) {
                        Text("\(fiches.total)")
                            .font(.system(size: 40, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(Color.accent)
                            .contentTransition(.numericText())
                        Text(fiches.total == 1 ? "carte à réviser" : "cartes à réviser")
                            .font(.subheadline).foregroundStyle(.secondary)
                        if let p = fiches.prochainPaquet {
                            Text(p.titre).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                    Spacer()
                    Text("Réviser")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, Espace.l)
                        .frame(minHeight: 44)
                        .background(Color.accent, in: .capsule)
                } else {
                    // Moment fort : tout est fait, on le dit.
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 32))
                        .foregroundStyle(.green)
                        .symbolEffect(.bounce, value: fiches.revisesAujourdhui)
                    VStack(alignment: .leading, spacing: Espace.xs) {
                        Text("Révisions à jour").font(.body.weight(.semibold))
                        Text(fiches.revisesAujourdhui > 0
                             ? "\(fiches.revisesAujourdhui) cartes révisées aujourd’hui. Bien joué !"
                             : "Rien à revoir pour l’instant.")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    Spacer()
                }
            }
            .carte()
        }
        .buttonStyle(.plain)
    }
}

private struct CarteMarche: View {
    let marche: MarcheProche

    var body: some View {
        NavigationLink(value: LienMarche(slug: marche.slug)) {
            VStack(alignment: .leading, spacing: Espace.m) {
                HStack {
                    Label("Marché", systemImage: "chart.line.uptrend.xyaxis")
                        .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    Spacer()
                    Text("ferme \(marche.closesAt.dansCombienDeTemps)").font(.caption).foregroundStyle(.secondary)
                }
                Text(marche.question).font(.body.weight(.semibold)).multilineTextAlignment(.leading)
                HStack(spacing: Espace.xl) {
                    Valeur(valeur: Montant.pck(marche.cagnotte), libelle: "cagnotte")
                    if marche.maMise > 0 { Valeur(valeur: Montant.pck(marche.maMise), libelle: "ma mise") }
                }
            }
            .carte()
        }
        .buttonStyle(.plain)
    }
}

/// Valeur mise en avant, libellé discret dessous (la valeur compte plus que l'étiquette).
private struct Valeur: View {
    let valeur: String
    let libelle: String
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(valeur).font(.body.weight(.semibold)).monospacedDigit()
            Text(libelle).font(.caption).foregroundStyle(.secondary)
        }
    }
}

/// « de physique », « d’anglais », « de SI » (comme `deMatiere` du site).
func deMatiere(_ nom: String) -> String {
    let sigle = nom.count > 1 && nom == nom.uppercased()
    let mot = sigle ? nom : nom.prefix(1).lowercased() + nom.dropFirst()
    let voyelles = "aeiouyhâàéèêîïôû"
    if !sigle, let premiere = mot.first, voyelles.contains(premiere) { return "d’\(mot)" }
    return "de \(mot)"
}
