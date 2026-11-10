import SwiftUI

/// Commentaires d'une vidéo : liste, saisie en bas, suppression par glissement quand c'est permis.
struct CommentairesVue: View {
    let video: Video
    let changement: (Int) -> Void

    @Environment(Session.self) private var session
    @State private var liste: [CommentaireVideo]?
    @State private var texte = ""
    @State private var envoi = false
    @State private var erreur: String?
    @FocusState private var saisie: Bool

    private func peutSupprimer(_ c: CommentaireVideo) -> Bool {
        guard let u = session.utilisateur else { return false }
        return u.estAdmin || c.auteurId == u.id || video.auteurId == u.id
    }

    var body: some View {
        NavigationStack {
            Group {
                if let liste {
                    if liste.isEmpty {
                        ContentUnavailableView("Pas encore de commentaire", systemImage: "bubble.left.and.bubble.right",
                                               description: Text("Dis à \(video.auteur) ce que tu en as pensé."))
                    } else {
                        List(liste) { c in
                            VStack(alignment: .leading, spacing: Espace.xs) {
                                Text(c.auteur).font(.subheadline.weight(.semibold))
                                Text(c.texte).font(.body)
                            }
                            .padding(.vertical, Espace.xs)
                            .listRowBackground(Color.clear)
                            .swipeActions {
                                if peutSupprimer(c) {
                                    Button("Supprimer", systemImage: "trash", role: .destructive) {
                                        Task { await executer { try await session.api.envoyer("DELETE", "api/app/commentaires/\(c.id)") } }
                                    }
                                }
                            }
                        }
                        .listStyle(.plain)
                        .scrollContentBackground(.hidden)
                    }
                } else {
                    ProgressView().frame(maxHeight: .infinity)
                }
            }
            .safeAreaInset(edge: .bottom) { barreSaisie }
            .navigationTitle(liste.map { "\($0.count) commentaire\($0.count > 1 ? "s" : "")" } ?? "Commentaires")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { await executer { try await session.api.get("api/app/videos/\(video.id)/commentaires") } }
    }

    private var barreSaisie: some View {
        VStack(spacing: Espace.xs) {
            if let erreur { Text(erreur).font(.caption).foregroundStyle(.red) }
            HStack(spacing: Espace.s) {
                TextField("Ajouter un commentaire…", text: $texte, axis: .vertical)
                    .lineLimit(1...4)
                    .focused($saisie)
                    .padding(.horizontal, Espace.m).padding(.vertical, Espace.s)
                    .background(Color.surface, in: .rect(cornerRadius: 18, style: .continuous))
                Button {
                    let t = texte.trimmingCharacters(in: .whitespacesAndNewlines)
                    Task {
                        await executer {
                            try await session.api.envoyer("POST", "api/app/videos/\(video.id)/commentaires", ["texte": t])
                        }
                        if erreur == nil { texte = "" }
                    }
                } label: {
                    Image(systemName: "arrow.up.circle.fill").font(.system(size: 32))
                }
                .disabled(texte.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || texte.count > 500 || envoi)
                .accessibilityLabel("Envoyer")
            }
        }
        .padding(.horizontal, Espace.l)
        .padding(.vertical, Espace.s)
        .background(.bar)
    }

    private func executer(_ action: () async throws -> ReponseCommentaires) async {
        envoi = true
        defer { envoi = false }
        do {
            let r = try await action()
            withAnimation(.snappy) { liste = r.commentaires }
            changement(r.commentaires.count)
            erreur = nil
        } catch {
            session.signaler(error)
            erreur = error.localizedDescription
            if liste == nil { liste = [] }
        }
    }
}
