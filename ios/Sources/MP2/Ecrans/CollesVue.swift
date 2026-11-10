import SwiftUI

/*
 * Colles de la semaine pour un groupe (le sien par défaut), jour par jour.
 * Chevrons ou balayage horizontal pour changer de semaine ; le menu du
 * haut permet de regarder un autre groupe sans changer le sien.
 */
struct CollesVue: View {
    @Environment(Session.self) private var session
    @State private var semaine: String?       // lundi affiché ; nil = semaine courante
    @State private var groupe: Int?           // groupe regardé ; nil = le mien

    private struct Cle: Hashable { let semaine: String?; let groupe: Int?; let moi: Int? }

    var body: some View {
        NavigationStack {
            Chargement(cle: Cle(semaine: semaine, groupe: groupe, moi: session.utilisateur?.groupeColle)) { api in
                try await api.get("api/app/colles", ["semaine": semaine, "groupe": groupe.map(String.init)]) as ReponseColles
            } contenu: { r, recharger in
                Group {
                    if let g = r.groupe, let s = r.semaine {
                        ContenuSemaine(r: r, semaineAffichee: s, groupe: g, semaine: $semaine)
                            .refreshable { await recharger() }
                            .toolbar {
                                ToolbarItem(placement: .topBarTrailing) {
                                    MenuGroupe(r: r, groupe: $groupe)
                                }
                            }
                    } else {
                        ChoixGroupe(max: r.groupeMax)
                    }
                }
            }
            .background(Color.fond)
            .navigationTitle("Colles")
        }
    }
}

private struct MenuGroupe: View {
    let r: ReponseColles
    @Binding var groupe: Int?

    var body: some View {
        Menu {
            Picker("Groupe", selection: Binding(get: { r.groupe }, set: { g in groupe = g == r.moi ? nil : g })) {
                ForEach(1...max(r.groupeMax, 1), id: \.self) { g in
                    Text(g == r.moi ? "Groupe \(g) (le mien)" : "Groupe \(g)").tag(Int?.some(g))
                }
            }
        } label: {
            HStack(spacing: Espace.xs) {
                Text(r.groupe.map { "Groupe \($0)" } ?? "Groupe")
                Image(systemName: "chevron.up.chevron.down").font(.caption)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(r.groupe == r.moi ? Color.primary : Color.accent)
        }
        .accessibilityLabel("Choisir le groupe affiché")
    }
}

private struct ContenuSemaine: View {
    let r: ReponseColles
    let semaineAffichee: ReponseColles.Semaine
    let groupe: Int
    @Binding var semaine: String?
    @State private var sens: Edge = .trailing

    private var jours: [(jour: String, colles: [Colle])] {
        let parJour = Dictionary(grouping: semaineAffichee.colles) { Paris.jour($0.debut) }
        return parJour.keys.sorted().map { ($0, parJour[$0]!.sorted { $0.debut < $1.debut }) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Espace.xl) {
                EnTeteSemaine(r: r, semaineAffichee: semaineAffichee, aller: aller)

                if r.groupe != r.moi {
                    Label("Tu regardes le groupe \(groupe).", systemImage: "eye")
                        .font(.subheadline).foregroundStyle(Color.accent)
                }

                ForEach(semaineAffichee.notes, id: \.self) { n in
                    Label(n, systemImage: "info.circle").font(.subheadline).foregroundStyle(.secondary)
                }

                if jours.isEmpty {
                    ContentUnavailableView("Pas de colle cette semaine",
                                           systemImage: "cup.and.saucer",
                                           description: Text(semaineAffichee.periode == nil
                                                             ? "Cette semaine n’est pas couverte par le colloscope."
                                                             : "Profites-en pour avancer tes fiches."))
                } else {
                    ForEach(jours, id: \.jour) { j in
                        VStack(alignment: .leading, spacing: Espace.m) {
                            TitreSection(titre: titreJour(j.jour), detail: j.jour == Paris.jour(.now) ? "Aujourd’hui" : nil)
                            ForEach(j.colles) { CarteColle(colle: $0) }
                        }
                    }
                }
            }
            .padding(.horizontal, Espace.l)
            .padding(.vertical, Espace.s)
            .id(r.lundi)
            .transition(.push(from: sens))
        }
        .animation(.smooth, value: r.lundi)
        .gesture(DragGesture(minimumDistance: 30).onEnded { g in
            guard abs(g.translation.width) > abs(g.translation.height) * 1.5, abs(g.translation.width) > 80 else { return }
            aller(g.translation.width < 0 ? 7 : -7)
        })
        .sensoryFeedback(.selection, trigger: r.lundi)
    }

    private func aller(_ jours: Int) {
        sens = jours > 0 ? .trailing : .leading
        let cible = jours == 0 ? r.lundiCourant : Paris.ajouter(jours, joursA: r.lundi)
        semaine = cible == r.lundiCourant ? nil : cible
    }

    private func titreJour(_ jour: String) -> String {
        guard let d = Paris.date(jour) else { return jour }
        return d.formatted(Paris.style(.dateTime.weekday(.wide).day().month(.wide))).capitalized(with: Paris.langue)
    }
}

private struct EnTeteSemaine: View {
    let r: ReponseColles
    let semaineAffichee: ReponseColles.Semaine
    let aller: (Int) -> Void

    private var titre: String {
        guard let lundi = Paris.date(r.lundi), let samedi = Paris.date(Paris.ajouter(5, joursA: r.lundi)) else { return r.lundi }
        let f = Paris.style(.dateTime.day().month(.abbreviated))
        return "\(lundi.formatted(f)) – \(samedi.formatted(f))"
    }

    var body: some View {
        HStack {
            BoutonRond(icone: "chevron.left", libelle: "Semaine précédente") { aller(-7) }
            Spacer()
            VStack(spacing: 2) {
                Text(titre).font(.body.weight(.semibold)).monospacedDigit()
                if let n = semaineAffichee.numero {
                    Text("Colle \(n)\(semaineAffichee.rotation.map { " · \($0)" } ?? "")")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if r.lundi != r.lundiCourant {
                    Button("Revenir à cette semaine") { aller(0) }.font(.caption.weight(.semibold))
                }
            }
            Spacer()
            BoutonRond(icone: "chevron.right", libelle: "Semaine suivante") { aller(7) }
        }
    }
}

private struct BoutonRond: View {
    let icone: String
    let libelle: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: icone)
                .font(.body.weight(.semibold))
                .frame(width: 44, height: 44)
                .background(Color.surface, in: .circle)
        }
        .accessibilityLabel(libelle)
    }
}

private struct CarteColle: View {
    let colle: Colle

    var body: some View {
        HStack(alignment: .top, spacing: Espace.m) {
            RoundedRectangle(cornerRadius: 2).fill(Color.matiere(colle.couleur)).frame(width: 4)
            VStack(alignment: .leading, spacing: Espace.s) {
                HStack(alignment: .firstTextBaseline) {
                    Text(colle.matiere).font(.body.weight(.semibold))
                    Spacer()
                    Text("\(colle.debut.heure) – \(colle.fin.heure)")
                        .font(.subheadline).monospacedDigit().foregroundStyle(.secondary)
                }
                HStack(spacing: Espace.l) {
                    Label(colle.colleur, systemImage: "person")
                    Label(colle.salle, systemImage: "mappin.and.ellipse")
                }
                .font(.subheadline).foregroundStyle(.secondary)
                if let a = colle.alternative {
                    Text("Sinon \(a.debut.jourCourt), \(a.debut.heure) – \(a.fin.heure), \(a.salle) : \(a.condition)")
                        .font(.caption).foregroundStyle(.secondary)
                }
                ForEach(colle.notes, id: \.self) { Text($0).font(.caption).foregroundStyle(.secondary) }
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .carte()
        .accessibilityElement(children: .combine)
    }
}

/// Premier passage : le membre indique son groupe (une grille de pastilles, pas de saisie).
private struct ChoixGroupe: View {
    let max: Int
    @Environment(Session.self) private var session
    @State private var enCours: Int?
    @State private var erreur: String?

    var body: some View {
        ScrollView {
            VStack(spacing: Espace.xl) {
                VStack(spacing: Espace.s) {
                    Image(systemName: "person.2.fill").font(.system(size: 40)).foregroundStyle(Color.accent)
                    Text("Quel est ton groupe de colle ?").font(.title3.weight(.semibold))
                    Text("Tes colles s’afficheront ici et sur l’accueil. Tu pourras le changer plus tard.")
                        .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: Espace.m), count: 4), spacing: Espace.m) {
                    ForEach(1...Swift.max(max, 1), id: \.self) { g in
                        Button { Task { await choisir(g) } } label: {
                            ZStack {
                                Text("\(g)").opacity(enCours == g ? 0 : 1)
                                if enCours == g { ProgressView() }
                            }
                            .font(.title3.weight(.semibold)).monospacedDigit()
                            .frame(maxWidth: .infinity, minHeight: 56)
                            .background(Color.surface, in: .rect(cornerRadius: Rayon.element, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(enCours != nil)
                        .accessibilityLabel("Groupe \(g)")
                    }
                }
                if let erreur { Text(erreur).font(.subheadline).foregroundStyle(.red) }
            }
            .padding(Espace.xl)
        }
        .sensoryFeedback(.success, trigger: session.utilisateur?.groupeColle)
    }

    private func choisir(_ g: Int) async {
        enCours = g
        defer { enCours = nil }
        do {
            try await session.api.envoyer("PUT", "api/app/groupe", ["groupe": g])
            session.groupeChange(g)          // la clé de chargement change : la semaine se recharge
        } catch {
            session.signaler(error)
            erreur = error.localizedDescription
        }
    }
}
