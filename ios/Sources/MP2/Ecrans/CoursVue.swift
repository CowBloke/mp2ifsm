import PDFKit
import SwiftUI

enum SegmentCours: Hashable { case cours, documents }

/// Onglet Cours : les cours publiés et les documents de la classe, au même endroit.
struct OngletCours: View {
    @State private var segment: SegmentCours = .cours

    var body: some View {
        Group {
            switch segment {
            case .cours: CoursVue(segment: $segment)
            case .documents: DocumentsVue(segment: $segment)
            }
        }
        .sensoryFeedback(.selection, trigger: segment)
    }
}

struct SelecteurCours: View {
    @Binding var segment: SegmentCours
    var body: some View {
        Picker("Rubrique", selection: $segment) {
            Text("Cours").tag(SegmentCours.cours)
            Text("Documents").tag(SegmentCours.documents)
        }
        .pickerStyle(.segmented)
        .frame(width: 220)
    }
}

/*
 * Cours : chapitres par matière ; dans chaque chapitre, les PDF du cours,
 * les fiches proposées (à suivre et réviser ici) et les corrigés.
 * La barre de recherche est l'assistant : elle cherche dans le texte de
 * tous les PDF et ouvre la page exacte.
 */
struct CoursVue: View {
    @Binding var segment: SegmentCours
    @State private var question = ""
    @State private var ouvert: OuverturePDF?
    @State private var revision: SessionRevision?

    var body: some View {
        NavigationStack {
            Chargement({ try await $0.get("api/app/cours") as ReponseCours }) { r, recharger in
                Group {
                    if question.trimmingCharacters(in: .whitespaces).count >= 2 {
                        Assistant(question: question) { ouvert = $0 }
                    } else {
                        Chapitres(chapitres: r.chapitres)
                            .refreshable { await recharger() }
                    }
                }
                .navigationDestination(for: ChapitreCours.self) { c in
                    ChapitreVue(chapitre: c, ouvrir: { ouvert = $0 }, reviser: { revision = $0 }, apres: recharger)
                }
                .fullScreenCover(item: $revision, onDismiss: { Task { await recharger() } }) { RevisionVue(session: $0) }
            }
            .background(Color.fond)
            .navigationTitle("Cours")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .principal) { SelecteurCours(segment: $segment) } }
            .searchable(text: $question, placement: .navigationBarDrawer(displayMode: .always),
                        prompt: "Demande au cours : « forme exponentielle »…")
            .sheet(item: $ouvert) { o in PDFVue(ouverture: o) }
        }
    }
}

private struct Chapitres: View {
    let chapitres: [ChapitreCours]

    var body: some View {
        if chapitres.isEmpty {
            ContentUnavailableView("Pas encore de cours", systemImage: "books.vertical",
                                   description: Text("Les chapitres apparaîtront ici dès qu’ils seront publiés."))
        } else {
            let parMatiere = Dictionary(grouping: chapitres) { $0.matiere ?? "Autres" }
            let ordre = chapitres.reduce(into: [String]()) { acc, c in
                let m = c.matiere ?? "Autres"
                if !acc.contains(m) { acc.append(m) }
            }
            ScrollView {
                LazyVStack(alignment: .leading, spacing: Espace.xxl) {
                    ForEach(ordre, id: \.self) { m in
                        VStack(alignment: .leading, spacing: Espace.m) {
                            TitreSection(titre: m)
                            VStack(spacing: 0) {
                                ForEach(Array(parMatiere[m]!.enumerated()), id: \.element.id) { i, c in
                                    if i > 0 { Divider().padding(.leading, 64) }
                                    NavigationLink(value: c) { LigneChapitre(chapitre: c) }.buttonStyle(.plain)
                                }
                            }
                            .carte(marge: 0)
                        }
                    }
                }
                .padding(.horizontal, Espace.l)
                .padding(.vertical, Espace.s)
            }
        }
    }
}

private struct LigneChapitre: View {
    let chapitre: ChapitreCours

    private var detail: String {
        var parties: [String] = []
        if !chapitre.supports.isEmpty { parties.append("Cours") }
        if !chapitre.paquets.isEmpty { parties.append("\(chapitre.paquets.count) paquet\(chapitre.paquets.count > 1 ? "s" : "")") }
        if !chapitre.corriges.isEmpty { parties.append("\(chapitre.corriges.count) corrigé\(chapitre.corriges.count > 1 ? "s" : "")") }
        return parties.joined(separator: " · ")
    }

    var body: some View {
        HStack(spacing: Espace.m) {
            Text(chapitre.numero.map(String.init) ?? "•")
                .font(.body.weight(.semibold)).monospacedDigit()
                .foregroundStyle(Color.matiere(chapitre.couleur))
                .frame(width: 40, height: 40)
                .background(Color.matiere(chapitre.couleur).opacity(0.12), in: .rect(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(chapitre.titre).font(.body).foregroundStyle(.primary).multilineTextAlignment(.leading)
                if !detail.isEmpty { Text(detail).font(.caption).foregroundStyle(.secondary) }
            }
            Spacer(minLength: Espace.s)
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
        }
        .padding(.horizontal, Espace.l)
        .padding(.vertical, Espace.m)
        .contentShape(.rect)
    }
}

// MARK: Chapitre

private struct ChapitreVue: View {
    let chapitre: ChapitreCours
    let ouvrir: (OuverturePDF) -> Void
    let reviser: (SessionRevision) -> Void
    let apres: () async -> Void
    @Environment(Session.self) private var session
    @State private var paquets: [Paquet]
    @State private var corrigesVisibles = false
    @State private var erreur: String?

    init(chapitre: ChapitreCours, ouvrir: @escaping (OuverturePDF) -> Void,
         reviser: @escaping (SessionRevision) -> Void, apres: @escaping () async -> Void) {
        self.chapitre = chapitre
        self.ouvrir = ouvrir
        self.reviser = reviser
        self.apres = apres
        _paquets = State(initialValue: chapitre.paquets)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Espace.xxl) {
                VStack(alignment: .leading, spacing: Espace.s) {
                    if let m = chapitre.matiere { PastilleMatiere(nom: m, couleur: chapitre.couleur) }
                    Text(chapitre.numero.map { "Chapitre \($0) · \(chapitre.titre)" } ?? chapitre.titre)
                        .font(.title2.weight(.semibold))
                    if !chapitre.resume.isEmpty { Text(chapitre.resume).font(.body).foregroundStyle(.secondary) }
                }

                if !chapitre.supports.isEmpty {
                    Bloc(titre: "Cours") {
                        ForEach(Array(chapitre.supports.enumerated()), id: \.element.id) { i, f in
                            if i > 0 { Divider().padding(.leading, 56) }
                            Button { ouvrir(OuverturePDF(fichier: f, page: 1)) } label: { LigneFichier(fichier: f) }
                                .buttonStyle(.plain)
                        }
                    }
                }

                if !paquets.isEmpty {
                    Bloc(titre: "Fiches proposées") {
                        ForEach(Array(paquets.enumerated()), id: \.element.id) { i, p in
                            if i > 0 { Divider().padding(.leading, 60) }
                            HStack(spacing: 0) {
                                Button {
                                    if p.abonne { reviser(SessionRevision(paquet: p.id, titre: p.titre)) }
                                } label: { LignePaquet(paquet: p) }
                                .buttonStyle(.plain)
                                .disabled(!p.abonne || p.aFaire == 0)
                                if !p.abonne {
                                    Button("Suivre") { Task { await suivre(p) } }
                                        .font(.subheadline.weight(.semibold))
                                        .buttonStyle(.borderedProminent)
                                        .buttonBorderShape(.capsule)
                                        .padding(.trailing, Espace.l)
                                }
                            }
                        }
                    }
                    if let erreur { Text(erreur).font(.subheadline).foregroundStyle(.red) }
                }

                if !chapitre.corriges.isEmpty {
                    VStack(alignment: .leading, spacing: Espace.m) {
                        Button { withAnimation(.snappy) { corrigesVisibles.toggle() } } label: {
                            HStack {
                                TitreSection(titre: "Corrigés", detail: "\(chapitre.corriges.count)")
                                Image(systemName: "chevron.down")
                                    .font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
                                    .rotationEffect(.degrees(corrigesVisibles ? 0 : -90))
                            }
                        }
                        .buttonStyle(.plain)
                        if corrigesVisibles {
                            VStack(spacing: 0) {
                                ForEach(Array(chapitre.corriges.enumerated()), id: \.element.id) { i, f in
                                    if i > 0 { Divider().padding(.leading, 56) }
                                    Button { ouvrir(OuverturePDF(fichier: f, page: 1)) } label: { LigneFichier(fichier: f) }
                                        .buttonStyle(.plain)
                                }
                            }
                            .carte(marge: 0)
                            .transition(.opacity.combined(with: .move(edge: .top)))
                        } else {
                            Text("Cherche d’abord par toi-même : les corrigés sont là quand tu bloques.")
                                .font(.subheadline).foregroundStyle(.secondary).padding(.horizontal, Espace.xs)
                        }
                    }
                }
            }
            .padding(Espace.l)
        }
        .background(Color.fond)
        .navigationBarTitleDisplayMode(.inline)
        .sensoryFeedback(.success, trigger: paquets.filter(\.abonne).count)
    }

    private func suivre(_ p: Paquet) async {
        do {
            let _: ReponsePaquet = try await session.api.envoyer("PATCH", "api/app/fiches/\(p.id)", ["suivre": true])
            if let i = paquets.firstIndex(where: { $0.id == p.id }) { withAnimation(.snappy) { paquets[i].abonne = true } }
            erreur = nil
            await apres()
        } catch {
            session.signaler(error)
            erreur = error.localizedDescription
        }
    }
}

private struct Bloc<Contenu: View>: View {
    let titre: String
    @ViewBuilder let contenu: Contenu
    var body: some View {
        VStack(alignment: .leading, spacing: Espace.m) {
            TitreSection(titre: titre)
            VStack(spacing: 0) { contenu }.carte(marge: 0)
        }
    }
}

private struct LigneFichier: View {
    let fichier: FichierCours
    var body: some View {
        HStack(spacing: Espace.m) {
            Image(systemName: fichier.genre == "cours" ? "book.closed.fill" : "checkmark.seal.text.page.fill")
                .font(.title3).foregroundStyle(Color.accent).frame(width: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(fichier.titre).font(.body).foregroundStyle(.primary).multilineTextAlignment(.leading)
                Text("\(fichier.libelleGenre) · \(fichier.pages) pages · \(Montant.octets(fichier.taille))")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: Espace.s)
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
        }
        .padding(.horizontal, Espace.l)
        .padding(.vertical, Espace.m)
        .contentShape(.rect)
    }
}

// MARK: Assistant

private struct Assistant: View {
    let question: String
    let ouvrir: (OuverturePDF) -> Void

    var body: some View {
        Chargement(cle: question) { [question] api in
            try await Task.sleep(for: .milliseconds(300))      // on attend la fin de la frappe
            return try await api.get("api/app/cours/recherche", ["q": question]) as ReponseRechercheCours
        } contenu: { r, _ in
            if r.resultats.isEmpty {
                ContentUnavailableView {
                    Label("Rien trouvé dans le cours", systemImage: "text.magnifyingglass")
                } description: {
                    Text("Essaie un mot du cours (« bijection », « primitive ») plutôt qu’une phrase entière.")
                }
            } else {
                List {
                    Section {
                        ForEach(r.resultats) { res in
                            Button { ouvrir(OuverturePDF(fichierId: res.fichierId, titre: res.fichier, page: res.page)) } label: {
                                VStack(alignment: .leading, spacing: Espace.s) {
                                    HStack(spacing: Espace.s) {
                                        if let m = res.matiere { PastilleMatiere(nom: m, couleur: res.couleur) }
                                        Text(res.chapitre).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                        Spacer()
                                        Text("p. \(res.page)").font(.caption.weight(.semibold)).monospacedDigit()
                                            .foregroundStyle(Color.accent)
                                    }
                                    Text(surligner(res.extrait, debut: r.debut, fin: r.fin))
                                        .font(.subheadline)
                                        .lineLimit(5)
                                    Text(res.fichier).font(.caption).foregroundStyle(.secondary)
                                }
                                .padding(.vertical, Espace.xs)
                            }
                            .buttonStyle(.plain)
                        }
                    } header: {
                        Text("\(r.resultats.count) passage\(r.resultats.count > 1 ? "s" : "") dans le cours")
                    }
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
            }
        }
    }

    /// Les mots trouvés (encadrés par le serveur) en gras sur fond d'accent.
    private func surligner(_ texte: String, debut: String, fin: String) -> AttributedString {
        var resultat = AttributedString()
        let propre = texte.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
        for (i, morceau) in propre.components(separatedBy: debut).enumerated() {
            if i == 0 { resultat += AttributedString(morceau); continue }
            let parts = morceau.components(separatedBy: fin)
            var mot = AttributedString(parts[0])
            mot.font = .subheadline.weight(.semibold)
            mot.foregroundColor = .accent
            mot.backgroundColor = Color.accent.opacity(0.12)
            resultat += mot
            resultat += AttributedString(parts.dropFirst().joined(separator: fin))
        }
        return resultat
    }
}

// MARK: Visionneuse PDF

struct OuverturePDF: Identifiable, Hashable {
    let fichierId: Int
    let titre: String
    let page: Int
    let version: Date?
    var id: String { "\(fichierId)-\(page)" }

    init(fichier: FichierCours, page: Int) {
        fichierId = fichier.id; titre = fichier.titre; self.page = page; version = fichier.updatedAt
    }
    init(fichierId: Int, titre: String, page: Int) {
        self.fichierId = fichierId; self.titre = titre; self.page = page; version = nil
    }
}

/*
 * PDF natif (PDFKit) ouvert à la bonne page. Le fichier est gardé dans le
 * cache de l'app, par version : rouvrir un cours est instantané, et une
 * nouvelle version publiée remplace l'ancienne.
 */
struct PDFVue: View {
    let ouverture: OuverturePDF
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var fermer
    @State private var document: PDFDocument?
    @State private var fichier: URL?
    @State private var erreur: String?

    var body: some View {
        NavigationStack {
            ZStack {
                if let document {
                    VuePDF(document: document, page: ouverture.page).ignoresSafeArea(edges: .bottom)
                } else if let erreur {
                    ContentUnavailableView("Impossible d’ouvrir le PDF", systemImage: "doc.questionmark",
                                           description: Text(erreur))
                } else {
                    ProgressView().controlSize(.large)
                }
            }
            .navigationTitle(ouverture.titre)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("OK") { fermer() } }
                if let fichier {
                    ToolbarItem(placement: .topBarLeading) { ShareLink(item: fichier) }
                }
            }
        }
        .task { await charger() }
    }

    private func charger() async {
        let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appending(path: "cours", directoryHint: .isDirectory)
        let version = ouverture.version.map { String(Int($0.timeIntervalSince1970)) } ?? "0"
        let cible = cache.appending(path: "\(ouverture.fichierId)-\(version).pdf")
        do {
            if !FileManager.default.fileExists(atPath: cible.path) || ouverture.version == nil {
                let tmp = try await session.api.telecharger("api/cours/fichier/\(ouverture.fichierId)", nom: "cours.pdf")
                try FileManager.default.createDirectory(at: cache, withIntermediateDirectories: true)
                // Anciennes versions du même fichier : remplacées.
                for ancien in (try? FileManager.default.contentsOfDirectory(at: cache, includingPropertiesForKeys: nil)) ?? []
                where ancien.lastPathComponent.hasPrefix("\(ouverture.fichierId)-") {
                    try? FileManager.default.removeItem(at: ancien)
                }
                try FileManager.default.moveItem(at: tmp, to: cible)
            }
            guard let d = PDFDocument(url: cible) else { throw ErreurAPI(message: "Fichier PDF illisible.", statut: -1) }
            let nomPartage = FileManager.default.temporaryDirectory.appending(path: "\(ouverture.titre).pdf")
            try? FileManager.default.removeItem(at: nomPartage)
            try? FileManager.default.copyItem(at: cible, to: nomPartage)
            fichier = nomPartage
            document = d
        } catch {
            session.signaler(error)
            erreur = error.localizedDescription
        }
    }
}

private struct VuePDF: UIViewRepresentable {
    let document: PDFDocument
    let page: Int

    func makeUIView(context: Context) -> PDFView {
        let v = PDFView()
        v.autoScales = true
        v.displayMode = .singlePageContinuous
        v.displayDirection = .vertical
        v.usePageViewController(false)
        v.backgroundColor = .secondarySystemBackground
        v.document = document
        if let p = document.page(at: max(0, min(page - 1, document.pageCount - 1))) {
            DispatchQueue.main.async { v.go(to: p) }
        }
        return v
    }

    func updateUIView(_ v: PDFView, context: Context) {}
}
