import SwiftUI

enum EditionEcheance: Identifiable {
    case nouvelle
    case modifier(Echeance)

    var id: String {
        switch self {
        case .nouvelle: "nouvelle"
        case .modifier(let e): "e\(e.id)"
        }
    }
}

/*
 * Une échéance n'a qu'un titre (« DS de maths » : le type s'écrit dedans),
 * une matière facultative et une date. Tout membre peut la corriger ; seul
 * son auteur ou un admin peut la supprimer (le serveur le vérifie).
 */
struct EcheanceFormulaire: View {
    let edition: EditionEcheance
    let matieres: [Matiere]
    let apres: () async -> Void

    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var fermer
    @State private var titre = ""
    @State private var matiere: Int?
    @State private var date = Paris.calendrier.date(byAdding: .day, value: 1,
                                                    to: Paris.calendrier.startOfDay(for: .now))!
                                                    .addingTimeInterval(8 * 3600)
    @State private var enCours = false
    @State private var erreur: String?
    @State private var confirmerSuppression = false
    @State private var enregistre = 0

    private var existante: Echeance? {
        if case .modifier(let e) = edition { e } else { nil }
    }
    private var titreValide: Bool { titre.trimmingCharacters(in: .whitespaces).count >= 3 }
    private var peutSupprimer: Bool {
        guard let e = existante, let u = session.utilisateur else { return false }
        return u.estAdmin || u.id == e.createdBy
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("DS de maths, DM 4…", text: $titre)
                        .font(.body)
                        .submitLabel(.done)
                } header: { Text("Titre") } footer: {
                    Text("Écris le type dans le titre : DS, DM, TIPE…")
                }
                Section {
                    Picker("Matière", selection: $matiere) {
                        Text("Aucune").tag(Int?.none)
                        ForEach(matieres) { m in
                            Label { Text(m.nom) } icon: { Circle().fill(Color.matiere(m.couleur)) }
                                .tag(Int?.some(m.id))
                        }
                    }
                    DatePicker("Date", selection: $date, displayedComponents: [.date, .hourAndMinute])
                        .environment(\.timeZone, Paris.fuseau)
                        .environment(\.locale, Paris.langue)
                }
                if let erreur {
                    Section { Label(erreur, systemImage: "exclamationmark.circle.fill").foregroundStyle(.red) }
                }
                if peutSupprimer {
                    Section {
                        Button("Supprimer l’échéance", role: .destructive) { confirmerSuppression = true }
                    }
                }
                if let e = existante {
                    Section {} footer: { Text("Ajoutée par \(e.auteur)") }
                }
            }
            .navigationTitle(existante == nil ? "Nouvelle échéance" : "Modifier")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { fermer() } }
                ToolbarItem(placement: .confirmationAction) {
                    if enCours { ProgressView() } else {
                        Button("Enregistrer") { Task { await enregistrer() } }.disabled(!titreValide)
                    }
                }
            }
            .confirmationDialog("Supprimer cette échéance pour toute la classe ?",
                                isPresented: $confirmerSuppression, titleVisibility: .visible) {
                Button("Supprimer", role: .destructive) { Task { await supprimer() } }
            }
            .sensoryFeedback(.success, trigger: enregistre)
            .interactiveDismissDisabled(enCours)
        }
        .presentationDetents([.medium, .large])
        .onAppear {
            guard let e = existante else { return }
            titre = e.titre
            matiere = e.subjectId
            date = e.dueAt
        }
    }

    private func enregistrer() async {
        await executer {
            let corps: [String: Any?] = [
                "titre": titre.trimmingCharacters(in: .whitespaces),
                "matiere": matiere.map(String.init) ?? "",
                "dueAt": date.formatted(Date.ISO8601FormatStyle(includingFractionalSeconds: true)),
            ]
            if let e = existante {
                try await session.api.envoyer("PATCH", "api/app/echeances/\(e.id)", corps)
            } else {
                try await session.api.envoyer("POST", "api/app/echeances", corps)
            }
        }
    }

    private func supprimer() async {
        guard let e = existante else { return }
        await executer { try await session.api.envoyer("DELETE", "api/app/echeances/\(e.id)") }
    }

    private func executer(_ action: () async throws -> Void) async {
        enCours = true
        defer { enCours = false }
        do {
            try await action()
            enregistre += 1
            await apres()
            fermer()
        } catch {
            session.signaler(error)
            erreur = error.localizedDescription
        }
    }
}
