import PhotosUI
import _PhotosUI_SwiftUI
import SwiftUI
import UIKit

/*
 * Toilet!, comme `/toilet` : le classement des passages aux toilettes du
 * bas. Rubrique cachée : le menu Détente ne la montre qu'aux membres
 * passés par le lien secret. Le gros bouton enregistre un passage, avec
 * photo de preuve facultative (appareil photo ou pellicule) ; sans
 * réseau correct, on valide sans photo et la preuve suit depuis « À prouver ».
 */
struct ToiletVue: View {
    @Environment(\.dismiss) private var fermer
    @State private var periode = "semaine"

    var body: some View {
        NavigationStack {
            Chargement(cle: periode) { [periode] api in
                try await api.get("api/app/toilet", ["periode": periode]) as ReponseToilet
            } contenu: { r, recharger in
                ContenuToilet(r: r, periode: $periode, recharger: recharger)
            }
            .background(Color.fond)
            .navigationTitle("Toilet!")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Fermer") { fermer() } }
            }
        }
    }
}

private struct ContenuToilet: View {
    let r: ReponseToilet
    @Binding var periode: String
    let recharger: () async -> Void

    @Environment(Session.self) private var session
    @State private var passage = false
    @State private var promotion: StatutToilet?
    @State private var avantPassage: StatutToilet?
    @State private var suppression: ReponseToilet.Passage?
    @State private var photoOuverte: ReponseToilet.Passage?
    @State private var erreur: String?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Espace.xxl) {
                Text("Le classement officiel des toilettes du bas. Laissez-les comme vous aimeriez les trouver.")
                    .font(.subheadline).foregroundStyle(.secondary)
                    .padding(.top, -Espace.l)
                CarteStatut(r: r)
                Button { passage = true } label: {
                    Label("J’y suis allé", systemImage: "toilet.fill").font(.title3.weight(.semibold))
                }
                .buttonStyle(BoutonPrincipal())
                if let erreur { Text(erreur).font(.subheadline).foregroundStyle(.red) }

                if !r.aProuver.isEmpty { aProuver }
                classement
                fil
                if let lien = r.lien {
                    VStack(alignment: .leading, spacing: Espace.s) {
                        ShareLink(item: API.base.appending(path: String(lien.dropFirst()))) {
                            Label("Partager le lien secret", systemImage: "link")
                        }
                        Text("La rubrique reste invisible pour qui n’a pas ouvert ce lien.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
            }
            .padding(Espace.l)
        }
        .refreshable { await recharger() }
        .sheet(isPresented: $passage) {
            FeuillePassage { _ in
                avantPassage = r.statut
                await recharger()
            }
        }
        // Un passage qui fait franchir un palier : le nouveau statut est célébré.
        .onChange(of: r.statut) { _, nouveau in
            if let a = avantPassage, nouveau.seuil > a.seuil {
                withAnimation(.spring(response: 0.45, dampingFraction: 0.7)) { promotion = nouveau }
            }
            avantPassage = nil
        }
        .sheet(item: $photoOuverte) { p in
            ImageDistante(url: API.base.appending(path: "api/toilet/photo/\(p.id)"), remplir: false)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.black)
                .presentationDragIndicator(.visible)
        }
        .confirmationDialog("Retirer ce passage ?", isPresented: Binding(get: { suppression != nil }, set: { if !$0 { suppression = nil } }),
                            titleVisibility: .visible, presenting: suppression) { p in
            Button("Retirer", role: .destructive) { Task { await retirer(p) } }
        } message: { _ in Text("Il sort du classement, avec sa photo.") }
        .overlay {
            if let promotion {
                Promotion(statut: promotion) { withAnimation(.smooth) { self.promotion = nil } }
                    .transition(.scale(scale: 0.8).combined(with: .opacity))
            }
        }
        .sensoryFeedback(.success, trigger: promotion)
    }

    // MARK: Sections

    private var aProuver: some View {
        VStack(alignment: .leading, spacing: Espace.m) {
            TitreSection(titre: "À prouver")
            Text("Tes passages sans photo : ajoute la preuve depuis la pellicule une fois le wifi retrouvé.")
                .font(.subheadline).foregroundStyle(.secondary).padding(.horizontal, Espace.xs)
            VStack(spacing: 0) {
                ForEach(Array(r.aProuver.enumerated()), id: \.element.id) { i, p in
                    if i > 0 { Divider().padding(.leading, Espace.l) }
                    LigneAProuver(passage: p, apres: recharger)
                }
            }
            .carte(marge: 0)
        }
    }

    private var classement: some View {
        VStack(alignment: .leading, spacing: Espace.m) {
            TitreSection(titre: "Classement")
            Picker("Période", selection: $periode) {
                Text("Semaine").tag("semaine")
                Text("Mois").tag("mois")
                Text("Toujours").tag("total")
            }
            .pickerStyle(.segmented)
            VStack(spacing: 0) {
                ForEach(Array(r.classement.enumerated()), id: \.element.id) { i, l in
                    if i > 0 { Divider().padding(.leading, 60) }
                    HStack(spacing: Espace.m) {
                        let podium = l.n > 0 && i < 3
                        Text(podium ? ["🥇", "🥈", "🥉"][i] : "\(i + 1)")
                            .font(.subheadline.weight(.bold)).monospacedDigit()
                            .frame(width: 32, height: 32)
                            .background(podium ? Color.accent.opacity(0.14) : Color.secondary.opacity(0.12), in: .circle)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: Espace.s) {
                                Text(l.pseudo).font(.body).lineLimit(1)
                                if l.moi { Text("toi").font(.caption).foregroundStyle(.secondary) }
                            }
                            Text("\(l.statut.emoji) \(l.statut.titre)\(l.photos > 0 ? " · 📸 \(l.photos)" : "")")
                                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                        Spacer(minLength: Espace.s)
                        Text("\(l.n)").font(.title3.weight(.bold)).monospacedDigit()
                    }
                    .padding(.horizontal, Espace.l).padding(.vertical, Espace.m)
                    .background(l.moi ? Color.accent.opacity(0.06) : .clear)
                }
            }
            .carte(marge: 0)
            .animation(.smooth, value: periode)
        }
    }

    private var fil: some View {
        VStack(alignment: .leading, spacing: Espace.m) {
            TitreSection(titre: "Derniers passages")
            if r.fil.isEmpty {
                Text("Personne n’est encore passé. Le trône t’attend.").font(.subheadline).foregroundStyle(.secondary)
            }
            ForEach(r.fil) { p in
                VStack(alignment: .leading, spacing: 0) {
                    if p.photo {
                        Button { photoOuverte = p } label: {
                            ImageDistante(url: API.base.appending(path: "api/toilet/photo/\(p.id)"))
                                .frame(height: 220).frame(maxWidth: .infinity).clipped()
                                .background(Color.secondary.opacity(0.1))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Preuve de propreté de \(p.pseudo)")
                    }
                    HStack(spacing: Espace.m) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(p.pseudo).font(.subheadline.weight(.semibold))
                                + Text(p.photo ? " · propreté prouvée ✅" : " · sans preuve 🤔").font(.subheadline).foregroundStyle(.secondary)
                            Text(p.creeLe.formatted(.relative(presentation: .named))).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if p.peutSupprimer {
                            Button { suppression = p } label: { Image(systemName: "trash").foregroundStyle(.secondary) }
                                .accessibilityLabel("Retirer ce passage")
                        }
                    }
                    .padding(Espace.l)
                }
                .background(Color.surface, in: .rect(cornerRadius: Rayon.carte, style: .continuous))
                .clipShape(.rect(cornerRadius: Rayon.carte, style: .continuous))
            }
        }
    }

    private func retirer(_ p: ReponseToilet.Passage) async {
        do {
            try await session.api.envoyer("DELETE", "api/app/toilet/passages/\(p.id)")
            await recharger()
        } catch {
            session.signaler(error)
            erreur = error.localizedDescription
        }
    }
}

private struct CarteStatut: View {
    let r: ReponseToilet

    var body: some View {
        VStack(alignment: .leading, spacing: Espace.l) {
            HStack(spacing: Espace.l) {
                Text(r.statut.emoji).font(.system(size: 32))
                    .frame(width: 56, height: 56)
                    .background(Color.accent.opacity(0.1), in: .rect(cornerRadius: 16, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Mon statut").font(.caption).foregroundStyle(.secondary)
                    Text(r.statut.titre).font(.title3.weight(.semibold))
                    Text(r.statut.devise).font(.footnote).italic().foregroundStyle(.secondary)
                }
            }
            HStack {
                Text("\(r.stats.total)").font(.body.weight(.semibold)).monospacedDigit()
                    + Text(" au total\(r.stats.aujourdhui > 0 ? " · \(r.stats.aujourdhui) aujourd’hui" : "")").foregroundStyle(.secondary)
                Spacer()
                if let d = r.stats.dernier {
                    Text(d.formatted(.relative(presentation: .named))).foregroundStyle(.secondary)
                }
            }
            .font(.subheadline)
            ProgressView(value: max(0.04, min(1, r.progression))).tint(Color.accent)
            Group {
                if let p = r.prochain {
                    Text("Encore \(p.restant) passage\(p.restant > 1 ? "s" : "") pour devenir ")
                        + Text("\(p.emoji) \(p.titre)").fontWeight(.semibold)
                } else {
                    Text("Sommet atteint. Il n’y a plus rien au-dessus de toi, à part le réservoir.")
                }
            }
            .font(.footnote).foregroundStyle(.secondary)
        }
        .carte()
    }
}

/// Le moment fort : un nouveau statut débloqué.
private struct Promotion: View {
    let statut: StatutToilet
    let fermer: () -> Void
    @State private var apparu = false

    var body: some View {
        ZStack {
            Color.black.opacity(0.45).ignoresSafeArea().onTapGesture(perform: fermer)
            VStack(spacing: Espace.l) {
                Text(statut.emoji).font(.system(size: 88))
                    .scaleEffect(apparu ? 1 : 0.3)
                    .rotationEffect(.degrees(apparu ? 0 : -25))
                    .shadow(color: Color.accent.opacity(0.5), radius: 24)
                Text("Nouveau statut").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                Text(statut.titre).font(.title2.weight(.bold)).multilineTextAlignment(.center)
                Text(statut.devise).font(.subheadline).italic().foregroundStyle(.secondary).multilineTextAlignment(.center)
                Button("Bien joué", action: fermer).buttonStyle(BoutonPrincipal()).padding(.top, Espace.s)
            }
            .padding(Espace.xxl)
            .frame(maxWidth: 340)
            .background(Color.surface, in: .rect(cornerRadius: 28, style: .continuous))
            .shadow(color: Color.accent.opacity(0.25), radius: 32, y: 12)
            .padding(Espace.xl)
        }
        .onAppear { withAnimation(.spring(response: 0.5, dampingFraction: 0.55).delay(0.05)) { apparu = true } }
    }
}

// MARK: Passage et preuve

/// Fenêtre du gros bouton : photo (appareil ou pellicule), puis validation.
private struct FeuillePassage: View {
    /// Reçoit le nouveau total.
    let fini: (Int) async -> Void
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var fermer
    @State private var photo: UIImage?
    @State private var item: PhotosPickerItem?
    @State private var camera = false
    @State private var enCours = false
    @State private var erreur: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: Espace.l) {
                if let photo {
                    Image(uiImage: photo).resizable().scaledToFill()
                        .frame(maxWidth: .infinity).frame(height: 260).clipped()
                        .clipShape(.rect(cornerRadius: Rayon.carte, style: .continuous))
                        .overlay(alignment: .topTrailing) {
                            Button { withAnimation { self.photo = nil } } label: {
                                Image(systemName: "xmark.circle.fill").font(.title2).symbolRenderingMode(.palette)
                                    .foregroundStyle(.white, .black.opacity(0.5))
                            }
                            .padding(Espace.s).accessibilityLabel("Retirer la photo")
                        }
                } else {
                    Text("Une photo prouve que tu as laissé les lieux propres. Facultatif, mais ça se voit au classement.")
                        .font(.subheadline).foregroundStyle(.secondary)
                    HStack(spacing: Espace.m) {
                        if UIImagePickerController.isSourceTypeAvailable(.camera) {
                            Button { camera = true } label: { source("Appareil photo", "camera.fill") }.buttonStyle(.plain)
                        }
                        PhotosPicker(selection: $item, matching: .images) { source("Pellicule", "photo.on.rectangle") }
                            .buttonStyle(.plain)
                    }
                }
                if let erreur { Text(erreur).font(.subheadline).foregroundStyle(.red) }
                Spacer(minLength: 0)
                VStack(spacing: Espace.m) {
                    Button { Task { await valider(avecPhoto: photo != nil) } } label: {
                        Text(photo == nil ? "Valider sans photo" : "Valider avec la photo")
                    }
                    .buttonStyle(BoutonPrincipal(chargement: enCours))
                    .disabled(enCours)
                    if photo != nil {
                        Button("Valider sans la photo") { Task { await valider(avecPhoto: false) } }
                            .font(.subheadline).disabled(enCours)
                    }
                }
            }
            .padding(Espace.l)
            .navigationTitle("Nouveau passage")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Annuler") { fermer() } } }
            .onChange(of: item) { _, i in
                guard let i else { return }
                item = nil
                Task {
                    if let d = try? await i.loadTransferable(type: Data.self), let img = UIImage(data: d) {
                        withAnimation { photo = img }
                    } else { erreur = "Photo illisible, essaies-en une autre." }
                }
            }
            .fullScreenCover(isPresented: $camera) {
                PriseDeVue { img in withAnimation { photo = img } }.ignoresSafeArea()
            }
        }
        .presentationDetents([.medium, .large])
        .interactiveDismissDisabled(enCours)
    }

    private func source(_ titre: String, _ symbole: String) -> some View {
        VStack(spacing: Espace.s) {
            Image(systemName: symbole).font(.title2).foregroundStyle(Color.accent)
            Text(titre).font(.subheadline.weight(.semibold))
        }
        .frame(maxWidth: .infinity, minHeight: 112)
        .background(Color.accent.opacity(0.08), in: .rect(cornerRadius: Rayon.carte, style: .continuous))
    }

    private func valider(avecPhoto: Bool) async {
        enCours = true
        defer { enCours = false }
        do {
            let total = try await session.api.passageToilet(photo: avecPhoto ? photo.flatMap(Preuve.jpeg) : nil)
            await fini(total)
            fermer()
        } catch {
            session.signaler(error)
            erreur = avecPhoto && (error as? ErreurAPI)?.statut == 0
                ? "Connexion trop faible. Valide sans photo, puis ajoute-la plus tard depuis « À prouver »."
                : error.localizedDescription
        }
    }
}

private struct LigneAProuver: View {
    let passage: ReponseToilet.APreuver
    let apres: () async -> Void
    @Environment(Session.self) private var session
    @State private var item: PhotosPickerItem?
    @State private var envoi = false
    @State private var erreur: String?

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(passage.creeLe.formatted(date: .abbreviated, time: .shortened)).font(.body)
                if let erreur { Text(erreur).font(.caption).foregroundStyle(.red) }
            }
            Spacer()
            PhotosPicker(selection: $item, matching: .images) {
                if envoi { ProgressView() } else { Label("Ajouter", systemImage: "photo.badge.plus").font(.subheadline.weight(.semibold)) }
            }
            .disabled(envoi)
        }
        .padding(.horizontal, Espace.l).padding(.vertical, Espace.m)
        .onChange(of: item) { _, i in
            guard let i else { return }
            item = nil
            Task { await envoyer(i) }
        }
    }

    private func envoyer(_ i: PhotosPickerItem) async {
        envoi = true
        defer { envoi = false }
        do {
            guard let d = try await i.loadTransferable(type: Data.self), let img = UIImage(data: d),
                  let jpeg = Preuve.jpeg(img) else { erreur = "Photo illisible."; return }
            try await session.api.prouverPassage(passage.id, photo: jpeg)
            await apres()
        } catch {
            session.signaler(error)
            erreur = error.localizedDescription
        }
    }
}

/// Photo réduite à 1600 px en JPEG : quelques centaines de ko, ce qui compte avec le wifi du bas.
enum Preuve {
    static func jpeg(_ image: UIImage) -> Data? {
        let cote = max(image.size.width, image.size.height)
        let echelle = min(1, 1600 / max(cote, 1))
        let taille = CGSize(width: image.size.width * echelle, height: image.size.height * echelle)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: taille, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: taille))
        }.jpegData(compressionQuality: 0.82)
    }
}

/// Appareil photo du système.
struct PriseDeVue: UIViewControllerRepresentable {
    let prise: (UIImage) -> Void
    @Environment(\.dismiss) private var fermer

    func makeCoordinator() -> Coordinateur { Coordinateur(self) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController()
        p.sourceType = .camera
        p.delegate = context.coordinator
        return p
    }

    func updateUIViewController(_ p: UIImagePickerController, context: Context) {}

    final class Coordinateur: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: PriseDeVue
        init(_ parent: PriseDeVue) { self.parent = parent }

        func imagePickerController(_ p: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { parent.prise(image) }
            parent.fermer()
        }

        func imagePickerControllerDidCancel(_ p: UIImagePickerController) { parent.fermer() }
    }
}
