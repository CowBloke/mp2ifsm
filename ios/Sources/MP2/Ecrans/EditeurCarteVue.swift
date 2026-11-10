import PhotosUI
import _PhotosUI_SwiftUI   // PhotosPicker : la surcouche n’est pas importée d’office par la chaîne Linux
import SwiftUI

/*
 * Éditeur de carte, comme sur le site : question / réponse ou texte à
 * trous, LaTeX et images. L'aperçu est composé par le serveur (même
 * HTML que la révision) et suit la saisie. En ajout, la feuille reste
 * ouverte après chaque carte pour enchaîner.
 */
struct EditeurCarteVue: View {
    enum Mode { case ajout(paquet: Int), correction(CarteListe) }

    let mode: Mode
    /// Appelé après chaque enregistrement réussi.
    let fini: () async -> Void

    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var fermer
    @State private var trous: Bool
    @State private var recto: String
    @State private var verso: String
    @State private var motif = ""
    @State private var apercu: ReponseApercu?
    @State private var voirApercu = false
    @State private var enCours = false
    @State private var erreur: String?
    @State private var ajoutees = 0
    @State private var curseurRecto = Curseur()
    @State private var curseurVerso = Curseur()

    /// Verso de remplissage d'un texte à trous sans remarque (cf. rendu.ts).
    private static let versoVide = "(vide)"

    init(mode: Mode, fini: @escaping () async -> Void) {
        self.mode = mode
        self.fini = fini
        if case .correction(let c) = mode {
            _trous = State(initialValue: c.recto.contains(#/\{\{c\d+::/#))
            _recto = State(initialValue: c.recto)
            _verso = State(initialValue: c.verso.trimmingCharacters(in: .whitespaces) == Self.versoVide ? "" : c.verso)
        } else {
            _trous = State(initialValue: false)
            _recto = State(initialValue: "")
            _verso = State(initialValue: "")
        }
    }

    private var correction: CarteListe? { if case .correction(let c) = mode { c } else { nil } }
    private var nombreTrous: Int { recto.matches(of: #/\{\{c\d+::/#).count }
    private var versoFinal: String {
        trous && verso.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? Self.versoVide : verso
    }
    private var pret: Bool {
        !recto.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && (trous ? nombreTrous > 0 : !verso.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Espace.xl) {
                    Picker("Type de carte", selection: $trous.animation(.snappy)) {
                        Text("Question / réponse").tag(false)
                        Text("Texte à trous").tag(true)
                    }
                    .pickerStyle(.segmented)

                    Bloc(titre: trous ? "Texte" : "Recto", curseur: curseurRecto) {
                        ChampFormule(texte: $recto,
                                     indication: trous ? "Écris la phrase, sélectionne un mot puis « Trou »."
                                                       : "Question. LaTeX : $f'(x)$ ou $$\\int_0^1 f$$",
                                     trous: trous, curseur: curseurRecto)
                    }
                    if trous {
                        Label(nombreTrous == 0 ? "Sélectionne un mot puis touche « Trou » au-dessus du clavier."
                                               : "\(nombreTrous) trou\(nombreTrous > 1 ? "s" : "") · révélés un par un, au hasard",
                              systemImage: "rectangle.dashed")
                            .font(.footnote).foregroundStyle(.secondary)
                            .padding(.top, -Espace.m)
                    }
                    Bloc(titre: trous ? "Remarque (facultatif)" : "Verso", curseur: curseurVerso) {
                        ChampFormule(texte: $verso,
                                     indication: trous ? "Affichée une fois tous les trous révélés" : "Réponse",
                                     curseur: curseurVerso)
                    }

                    if correction != nil {
                        VStack(alignment: .leading, spacing: Espace.s) {
                            Text("Motif").font(.subheadline.weight(.semibold))
                            TextField("Ce que tu corriges (visible dans l’historique)", text: $motif)
                                .padding(Espace.m)
                                .background(Color.surface, in: .rect(cornerRadius: Rayon.element, style: .continuous))
                        }
                    }

                    VStack(alignment: .leading, spacing: Espace.m) {
                        Toggle("Aperçu", isOn: $voirApercu.animation(.snappy)).font(.subheadline.weight(.semibold))
                        if voirApercu {
                            if let apercu {
                                VStack(alignment: .leading, spacing: Espace.m) {
                                    CarteHTML(html: apercu.recto)
                                    if !apercu.verso.isEmpty {
                                        Divider()
                                        CarteHTML(html: apercu.verso)
                                    }
                                }
                                .carte()
                            } else {
                                ProgressView().frame(maxWidth: .infinity)
                            }
                        }
                    }

                    if let erreur {
                        Label(erreur, systemImage: "exclamationmark.circle.fill")
                            .font(.subheadline).foregroundStyle(.red)
                    }
                }
                .padding(Espace.l)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color.fond)
            .navigationTitle(correction == nil ? (ajoutees > 0 ? "\(ajoutees) ajoutée\(ajoutees > 1 ? "s" : "")" : "Nouvelle carte")
                                                : "Corriger la carte")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(ajoutees > 0 ? "Terminé" : "Annuler") { fermer() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if enCours { ProgressView() } else {
                        Button(correction == nil ? "Ajouter" : "Enregistrer") { Task { await enregistrer() } }
                            .disabled(!pret)
                    }
                }
            }
            .task(id: voirApercu ? recto + "\u{0}" + versoFinal : nil) {
                guard voirApercu else { return }
                try? await Task.sleep(for: .milliseconds(apercu == nil ? 0 : 450))
                guard !Task.isCancelled else { return }
                if let r: ReponseApercu = try? await session.api.envoyer("POST", "api/app/apercu",
                                                                       ["recto": recto, "verso": versoFinal]) {
                    apercu = r
                }
            }
            .sensoryFeedback(.success, trigger: ajoutees)
        }
        .interactiveDismissDisabled(enCours || (correction == nil && !recto.isEmpty))
    }

    private func enregistrer() async {
        enCours = true
        defer { enCours = false }
        do {
            switch mode {
            case .ajout(let paquet):
                let _: CarteCreee = try await session.api.envoyer("POST", "api/app/fiches/\(paquet)/cartes",
                                                                  ["recto": recto, "verso": versoFinal])
                erreur = nil
                withAnimation(.snappy) { recto = ""; verso = ""; apercu = nil; ajoutees += 1 }
                await fini()
            case .correction(let c):
                try await session.api.envoyer("PATCH", "api/app/cartes/\(c.id)",
                                              ["recto": recto, "verso": versoFinal, "motif": motif])
                await fini()
                fermer()
            }
        } catch {
            session.signaler(error)
            erreur = error.localizedDescription
        }
    }
}

/// Un champ titré, avec l'ajout d'image (insérée à la position du curseur).
private struct Bloc<Champ: View>: View {
    let titre: String
    let curseur: Curseur
    @ViewBuilder let champ: Champ
    @Environment(Session.self) private var session
    @State private var photo: PhotosPickerItem?
    @State private var envoi = false
    @State private var erreur: String?

    var body: some View {
        VStack(alignment: .leading, spacing: Espace.s) {
            HStack {
                Text(titre).font(.subheadline.weight(.semibold))
                Spacer()
                PhotosPicker(selection: $photo, matching: .images) {
                    if envoi { ProgressView().controlSize(.small) }
                    else { Label("Image", systemImage: "photo.badge.plus").font(.subheadline) }
                }
                .disabled(envoi)
            }
            champ
                .background(Color.surface, in: .rect(cornerRadius: Rayon.element, style: .continuous))
            if let erreur { Text(erreur).font(.footnote).foregroundStyle(.red) }
        }
        .onChange(of: photo) { _, item in
            guard let item else { return }
            photo = nil
            Task { await envoyer(item) }
        }
    }

    /// Ré-encodée en JPEG (le serveur n'accepte pas le HEIC), 1600 px au plus.
    private func envoyer(_ item: PhotosPickerItem) async {
        envoi = true
        defer { envoi = false }
        do {
            guard let brut = try await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: brut), let jpeg = Self.reduite(image).jpegData(compressionQuality: 0.85) else {
                erreur = "Image illisible."
                return
            }
            let markdown = try await session.api.envoyerImageCarte(jpeg, nom: "image.jpg")
            curseur.inserer(markdown)
            erreur = nil
        } catch {
            session.signaler(error)
            erreur = error.localizedDescription
        }
    }

    private static func reduite(_ image: UIImage) -> UIImage {
        let cote = max(image.size.width, image.size.height)
        guard cote > 1600 else { return image }
        let echelle = 1600 / cote
        let taille = CGSize(width: image.size.width * echelle, height: image.size.height * echelle)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: taille, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: taille))
        }
    }
}
