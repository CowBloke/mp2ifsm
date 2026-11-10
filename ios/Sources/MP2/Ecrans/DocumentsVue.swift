import SwiftUI
import QuickLook
import UniformTypeIdentifiers

/*
 * Documents de la classe : dossiers (arborescence construite ici à partir
 * de la liste complète), recherche, aperçu QuickLook (PDF, images, Office),
 * envoi depuis Fichiers, mise à la corbeille par le déposant ou un admin.
 */
struct DocumentsVue: View {
    @Binding var segment: SegmentCours
    @State private var recherche = ""

    var body: some View {
        NavigationStack {
            DossierVue(dossier: nil, recherche: recherche)
                .toolbar { ToolbarItem(placement: .principal) { SelecteurCours(segment: $segment) } }
                .searchable(text: $recherche, placement: .navigationBarDrawer(displayMode: .always),
                            prompt: "Nom, tag ou personne")
                .navigationDestination(for: Dossier.self) { d in DossierVue(dossier: d, recherche: "") }
        }
    }
}

private struct DossierVue: View {
    let dossier: Dossier?
    let recherche: String

    @Environment(Session.self) private var session
    @State private var apercu: URL?
    @State private var ouverture: Int?
    @State private var importer = false
    @State private var envoi = false
    @State private var aSupprimer: Document?
    @State private var message: String?
    @State private var succes = 0

    private var terme: String { recherche.trimmingCharacters(in: .whitespaces) }

    var body: some View {
        Chargement(cle: "\(dossier?.id ?? 0)/\(terme.count >= 2 ? terme : "")") { [dossier, terme] (api: API) async throws -> ReponseDocuments in
            if terme.count >= 2 { try await Task.sleep(for: .milliseconds(300)) }   // anti-rebond de la saisie
            return try await api.get("api/app/documents", [
                "dossier": dossier.map { String($0.id) },
                "q": terme.count >= 2 ? terme : nil,
            ])
        } contenu: { r, recharger in
            liste(r)
                .refreshable { await recharger() }
                .onChange(of: succes) { Task { await recharger() } }
        }
        .background(Color.fond)
        .navigationTitle(dossier?.nom ?? "Documents")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if envoi { ProgressView() } else {
                    Button { importer = true } label: { Label("Ajouter un document", systemImage: "plus") }
                }
            }
        }
        .fileImporter(isPresented: $importer, allowedContentTypes: [.item], allowsMultipleSelection: true) { (r: Result<[URL], Error>) in
            guard case .success(let fichiers) = r else { return }
            Task { await deposer(fichiers) }
        }
        .sheet(item: Binding(get: { apercu.map(FichierApercu.init) }, set: { apercu = $0?.url })) { f in
            Apercu(url: f.url).ignoresSafeArea()
        }
        .confirmationDialog("Mettre « \(aSupprimer?.originalName ?? "") » à la corbeille ?",
                            isPresented: Binding(get: { aSupprimer != nil }, set: { if !$0 { aSupprimer = nil } }),
                            titleVisibility: .visible) {
            Button("Mettre à la corbeille", role: .destructive) {
                if let d = aSupprimer { Task { await supprimer(d) } }
            }
        } message: { Text("Il reste récupérable 30 jours depuis le site.") }
        .alert("Documents", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(message ?? "") }
        .sensoryFeedback(.success, trigger: succes)
    }

    @ViewBuilder
    private func liste(_ r: ReponseDocuments) -> some View {
        let enRecherche = terme.count >= 2
        let sousDossiers = enRecherche ? [] : r.dossiers
            .filter { $0.parentId == dossier?.id }
            .sorted { $0.nom.localizedStandardCompare($1.nom) == .orderedAscending }

        List {
            if !sousDossiers.isEmpty {
                Section {
                    ForEach(sousDossiers) { d in
                        NavigationLink(value: d) { LigneDossier(dossier: d) }
                    }
                }
            }
            Section {
                if r.documents.isEmpty {
                    if enRecherche {
                        ContentUnavailableView.search(text: terme)
                    } else if sousDossiers.isEmpty {
                        ContentUnavailableView {
                            Label("Dossier vide", systemImage: "tray")
                        } description: {
                            Text("Partage un cours, un TD ou une correction avec la classe.")
                        } actions: {
                            Button("Ajouter un document") { importer = true }.buttonStyle(.borderedProminent)
                        }
                    }
                } else {
                    ForEach(r.documents) { doc in
                        Button { Task { await ouvrir(doc) } } label: {
                            LigneDocument(document: doc, enCours: ouverture == doc.id)
                        }
                        .buttonStyle(.plain)
                        .swipeActions {
                            if doc.peutSupprimer {
                                Button("Corbeille", systemImage: "trash") { aSupprimer = doc }.tint(.red)
                            }
                        }
                    }
                }
            } header: {
                if enRecherche { Text("Résultats") } else if !r.documents.isEmpty && !sousDossiers.isEmpty { Text("Fichiers") }
            } footer: {
                if dossier == nil && !enRecherche { Jauge(usage: r.usage).padding(.top, Espace.l) }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
    }

    private func ouvrir(_ doc: Document) async {
        guard ouverture == nil else { return }
        ouverture = doc.id
        defer { ouverture = nil }
        do { apercu = try await session.api.telecharger("api/documents/\(doc.id)", nom: doc.originalName) }
        catch { session.signaler(error); message = error.localizedDescription }
    }

    private func deposer(_ fichiers: [URL]) async {
        envoi = true
        defer { envoi = false }
        var refus: [String] = []
        for f in fichiers {
            do { try await session.api.deposer(fichier: f, dossier: dossier?.id) }
            catch { session.signaler(error); refus.append("\(f.lastPathComponent) : \(error.localizedDescription)") }
        }
        if refus.count < fichiers.count { succes += 1 }
        if !refus.isEmpty { message = refus.joined(separator: "\n") }
    }

    private func supprimer(_ doc: Document) async {
        do {
            try await session.api.envoyer("DELETE", "api/app/documents/\(doc.id)")
            succes += 1
        } catch { session.signaler(error); message = error.localizedDescription }
    }
}

private struct LigneDossier: View {
    let dossier: Dossier
    var body: some View {
        HStack(spacing: Espace.m) {
            Image(systemName: "folder.fill")
                .font(.title3)
                .foregroundStyle(dossier.couleur == nil ? Color.accent : Color.matiere(dossier.couleur))
                .frame(width: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(dossier.nom).font(.body)
                Text(dossier.nbElements == 1 ? "1 élément" : "\(dossier.nbElements) éléments")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, Espace.xs)
    }
}

private struct LigneDocument: View {
    let document: Document
    let enCours: Bool

    private var icone: String {
        let m = document.mime
        if m == "application/pdf" { return "doc.richtext.fill" }
        if m.hasPrefix("image/") { return "photo.fill" }
        if m.contains("presentation") || m.contains("powerpoint") { return "rectangle.on.rectangle.fill" }
        if m.contains("sheet") || m.contains("excel") || m == "text/csv" { return "tablecells.fill" }
        if m.hasPrefix("text/") || m.contains("word") || m.contains("document") { return "doc.text.fill" }
        if m.contains("zip") { return "doc.zipper" }
        return "doc.fill"
    }

    var body: some View {
        HStack(spacing: Espace.m) {
            ZStack {
                Image(systemName: icone).opacity(enCours ? 0 : 1)
                if enCours { ProgressView() }
            }
            .font(.title3)
            .foregroundStyle(Color.matiere(document.couleur))
            .frame(width: 36)
            VStack(alignment: .leading, spacing: Espace.xs) {
                Text(document.originalName).font(.body).lineLimit(2)
                HStack(spacing: Espace.s) {
                    if let m = document.matiere { PastilleMatiere(nom: m, couleur: document.couleur) }
                    Text("\(Montant.octets(document.taille)) · \(document.uploader)")
                        .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, Espace.xs)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Ouvrir l’aperçu")
    }
}

/// Occupation de l'espace personnel (le quota commun compte aussi les images des fiches).
private struct Jauge: View {
    let usage: Occupation
    var body: some View {
        let part = usage.quotaMembre > 0 ? min(1, Double(usage.utiliseMembre) / Double(usage.quotaMembre)) : 0
        VStack(alignment: .leading, spacing: Espace.s) {
            ProgressView(value: part).tint(part > 0.9 ? .orange : .accent)
            Text("\(Montant.octets(usage.utiliseMembre)) utilisés sur \(Montant.octets(usage.quotaMembre))")
                .font(.caption).foregroundStyle(.secondary)
        }
    }
}

// MARK: Aperçu

private struct FichierApercu: Identifiable {
    let url: URL
    var id: URL { url }
}

/// QuickLook (PDF, images, Office, texte) : le contrôleur UIKit dans sa barre de navigation.
private struct Apercu: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UINavigationController {
        let ql = QLPreviewController()
        ql.dataSource = context.coordinator
        return UINavigationController(rootViewController: ql)
    }

    func updateUIViewController(_ nav: UINavigationController, context: Context) {
        context.coordinator.url = url
        (nav.viewControllers.first as? QLPreviewController)?.reloadData()
    }

    func makeCoordinator() -> Source { Source(url: url) }

    final class Source: NSObject, QLPreviewControllerDataSource {
        var url: URL
        init(url: URL) { self.url = url }
        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { url as NSURL }
    }
}
