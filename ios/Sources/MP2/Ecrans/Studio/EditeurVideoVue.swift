import AVFoundation
import SwiftUI

/*
 * Éditeur : aperçu du montage (plages, filtres et textes comme au rendu)
 * et quatre réglages : clips (couper, scinder, déplacer, son, filtre),
 * textes à l'écran, son, couverture. Rien n'est réencodé : la
 * publication envoie les clips bruts et ce montage.
 */
struct EditeurVideoVue: View {
    @Bindable var projet: Projet
    let publiee: () -> Void
    @Environment(\.dismiss) private var retour

    @State private var lecteur = AVPlayer()
    @State private var musique = AVPlayer()
    @State private var temps: Double = 0
    @State private var lecture = false
    @State private var observateur: Any?
    @State private var onglet = Onglet.clips
    @State private var selection: UUID?
    @State private var texteEdite: Projet.Texte?
    @State private var publier = false

    private enum Onglet: String, CaseIterable { case clips = "Clips", textes = "Textes", son = "Son", couverture = "Couverture" }

    var body: some View {
        VStack(spacing: Espace.m) {
            Apercu(projet: projet, lecteur: lecteur, temps: temps)
                .frame(maxHeight: .infinity)
                .onTapGesture { basculerLecture() }
                .overlay(alignment: .center) {
                    if !lecture {
                        Image(systemName: "play.fill").font(.system(size: 48)).foregroundStyle(.white.opacity(0.85))
                            .shadow(radius: 8).allowsHitTesting(false)
                    }
                }
            Frise(projet: projet, temps: temps) { t in aller(a: t) }
                .padding(.horizontal, Espace.l)

            Picker("Réglage", selection: $onglet) {
                ForEach(Onglet.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, Espace.l)

            Group {
                switch onglet {
                case .clips: ReglagesClips(projet: projet, selection: $selection, temps: temps)
                case .textes: ReglagesTextes(projet: projet, temps: temps, editer: { texteEdite = $0 })
                case .son: ReglagesSon(projet: projet)
                case .couverture: ReglageCouverture(projet: projet) { aller(a: $0) }
                }
            }
            .frame(height: 176)
        }
        .padding(.bottom, Espace.s)
        .background(Color.black.ignoresSafeArea())
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { lecteur.pause(); musique.pause(); retour() } label: { Label("Filmer", systemImage: "chevron.left") }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("Publier") { lecteur.pause(); musique.pause(); lecture = false; publier = true }
                    .font(.body.weight(.semibold))
                    .disabled(projet.clips.isEmpty)
            }
        }
        .toolbar(.visible, for: .navigationBar)
        .sheet(item: $texteEdite) { t in
            EditionTexte(texte: t, total: projet.dureeTotale) { nouveau in
                if let i = projet.textes.firstIndex(where: { $0.id == t.id }) {
                    if let nouveau { projet.textes[i] = nouveau } else { projet.textes.remove(at: i) }
                } else if let nouveau {
                    projet.textes.append(nouveau)
                }
            }
            .presentationDetents([.medium, .large])
        }
        .navigationDestination(isPresented: $publier) { PublicationVideoVue(projet: projet, publiee: publiee) }
        .task(id: Signature(projet: projet)) { await recharger() }
        .onAppear { observer() }
        .onDisappear { lecteur.pause(); musique.pause(); retirer() }
    }

    /// Ce qui change l'image ou le son de l'aperçu (les textes sont dessinés par-dessus).
    private struct Signature: Hashable {
        let clips: [Projet.Clip]
        let musique: Projet.Musique?
        @MainActor init(projet: Projet) { clips = projet.clips; musique = projet.musique }
    }

    private func recharger() async {
        let position = temps
        guard let item = await projet.apercu() else { lecteur.replaceCurrentItem(with: nil); return }
        lecteur.replaceCurrentItem(with: item)
        await lecteur.seek(to: CMTime(seconds: min(position, max(0, projet.dureeTotale - 0.05)), preferredTimescale: 600),
                           toleranceBefore: .zero, toleranceAfter: .zero)
        if let m = projet.musique {
            if (musique.currentItem?.asset as? AVURLAsset)?.url.lastPathComponent != "\(m.cle).m4a" {
                musique.replaceCurrentItem(with: AVPlayerItem(url: API.base.appending(path: "musique/\(m.cle).m4a")))
            }
            musique.volume = Float(m.volume)
        } else {
            musique.replaceCurrentItem(with: nil)
        }
        if lecture { lecteur.play(); synchroniserMusique(lire: true) }
    }

    private func basculerLecture() {
        if lecture {
            lecteur.pause(); musique.pause()
        } else {
            if temps >= projet.dureeTotale - 0.05 { aller(a: 0) }
            lecteur.play(); synchroniserMusique(lire: true)
        }
        lecture.toggle()
    }

    private func aller(a t: Double) {
        temps = t
        lecteur.seek(to: CMTime(seconds: t, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
        synchroniserMusique(lire: lecture)
    }

    private func synchroniserMusique(lire: Bool) {
        guard let m = projet.musique else { return }
        musique.seek(to: CMTime(seconds: m.debut + temps, preferredTimescale: 600))
        lire ? musique.play() : musique.pause()
    }

    private func observer() {
        retirer()
        observateur = lecteur.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 30), queue: .main) { t in
            MainActor.assumeIsolated {
                temps = t.seconds
                if lecture && t.seconds >= projet.dureeTotale - 0.03 {
                    lecture = false; lecteur.pause(); musique.pause()
                }
            }
        }
    }

    private func retirer() {
        if let observateur { lecteur.removeTimeObserver(observateur) }
        observateur = nil
    }
}

// MARK: Aperçu et frise

/// Image 9:16 et textes à l'échelle du rendu (taille rapportée au petit côté de l'image).
private struct Apercu: View {
    let projet: Projet
    let lecteur: AVPlayer
    let temps: Double

    var body: some View {
        GeometryReader { geo in
            let largeur = min(geo.size.width, geo.size.height * 9 / 16)
            let hauteur = largeur * 16 / 9
            ZStack {
                CoucheLecteur(lecteur: lecteur)
                ForEach(projet.textes.filter { temps >= $0.debut && temps < $0.fin }) { t in
                    TexteRendu(texte: t, largeur: largeur, hauteur: hauteur)
                }
            }
            .frame(width: largeur, height: hauteur)
            .clipShape(.rect(cornerRadius: 16, style: .continuous))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .padding(.horizontal, Espace.l)
    }
}

struct TexteRendu: View {
    let texte: Projet.Texte
    let largeur: CGFloat
    let hauteur: CGFloat

    private var taille: CGFloat {
        largeur * (texte.taille == "s" ? 0.045 : texte.taille == "l" ? 0.085 : 0.062)
    }

    var body: some View {
        VStack {
            if texte.position != "haut" { Spacer(minLength: 0) }
            Text(texte.texte)
                .font(.system(size: taille, weight: .bold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .padding(.horizontal, texte.fond ? taille * 0.28 : 0)
                .padding(.vertical, texte.fond ? taille * 0.14 : 0)
                .background(texte.fond ? Color.black.opacity(0.6) : .clear)
                .shadow(color: texte.fond ? .clear : .black.opacity(0.7), radius: 1, x: 2, y: 2)
                .frame(maxWidth: largeur * 0.86)
            if texte.position != "bas" { Spacer(minLength: 0) }
        }
        .padding(.top, texte.position == "haut" ? hauteur * 0.1 : 0)
        .padding(.bottom, texte.position == "bas" ? hauteur * 0.14 : 0)
        .frame(width: largeur, height: hauteur)
        .allowsHitTesting(false)
    }
}

private struct CoucheLecteur: UIViewRepresentable {
    let lecteur: AVPlayer
    func makeUIView(context: Context) -> VueLecteur {
        let v = VueLecteur()
        v.joueur = lecteur
        v.couche.videoGravity = .resizeAspectFill
        return v
    }
    func updateUIView(_ v: VueLecteur, context: Context) { v.joueur = lecteur }
}

/// Frise du montage : un bloc par clip (proportionnel), la tête de lecture, toucher ou glisser pour s'y rendre.
private struct Frise: View {
    let projet: Projet
    let temps: Double
    let aller: (Double) -> Void

    var body: some View {
        GeometryReader { geo in
            let total = max(projet.dureeTotale, 0.1)
            ZStack(alignment: .leading) {
                HStack(spacing: 2) {
                    ForEach(projet.clips) { c in
                        RoundedRectangle(cornerRadius: 4)
                            .fill(c.muet ? Color.white.opacity(0.3) : Color.accent.opacity(0.8))
                            .frame(width: max(4, geo.size.width * c.duree / total - 2))
                    }
                }
                Capsule().fill(.white).frame(width: 3, height: 40)
                    .offset(x: min(geo.size.width - 3, geo.size.width * temps / total))
            }
            .frame(height: 32)
            .contentShape(.rect)
            .gesture(DragGesture(minimumDistance: 0).onChanged { g in
                aller(min(total, max(0, g.location.x / geo.size.width * total)))
            })
        }
        .frame(height: 40)
        .overlay(alignment: .trailing) {
            Text("\(Self.format(temps)) / \(Self.format(projet.dureeTotale))")
                .font(.caption.weight(.semibold)).monospacedDigit().foregroundStyle(.white.opacity(0.7))
                .offset(y: 30)
        }
        .padding(.bottom, Espace.m)
        .accessibilityLabel("Position dans le montage")
    }

    static func format(_ s: Double) -> String {
        let t = max(0, Int(s.rounded()))
        return "\(t / 60):\(String(format: "%02d", t % 60))"
    }
}

// MARK: Réglages

private struct ReglagesClips: View {
    @Bindable var projet: Projet
    @Binding var selection: UUID?
    let temps: Double

    private var index: Int? {
        if let s = selection, let i = projet.clips.firstIndex(where: { $0.id == s }) { return i }
        return projet.clip(a: temps).flatMap { c in projet.clips.firstIndex { $0.id == c.0.id } }
    }

    var body: some View {
        VStack(spacing: Espace.m) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Espace.s) {
                    ForEach(Array(projet.clips.enumerated()), id: \.element.id) { i, c in
                        Button { selection = c.id } label: {
                            VStack(spacing: 2) {
                                Text("Clip \(i + 1)").font(.caption.weight(.semibold))
                                Text(String(format: "%.1f s", c.duree)).font(.caption2).monospacedDigit()
                            }
                            .padding(.horizontal, Espace.m).padding(.vertical, Espace.s)
                            .background(i == index ? Color.accent : Color.white.opacity(0.12), in: .rect(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, Espace.l)
            }
            if let i = index {
                let c = projet.clips[i]
                VStack(spacing: Espace.s) {
                    HStack {
                        Text("Début").font(.caption).frame(width: 40, alignment: .leading)
                        Slider(value: Binding(get: { c.debut }, set: { projet.clips[i].debut = min($0, projet.clips[i].fin - Projet.clipMin) }),
                               in: 0...max(Projet.clipMin, c.dureeSource - Projet.clipMin))
                        Text("Fin").font(.caption).frame(width: 28)
                        Slider(value: Binding(get: { c.fin }, set: { projet.clips[i].fin = max($0, projet.clips[i].debut + Projet.clipMin) }),
                               in: Projet.clipMin...max(Projet.clipMin + 0.01, c.dureeSource))
                    }
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: Espace.s) {
                            ForEach(FiltreVideo.tous) { f in
                                Button(f.libelle) { projet.clips[i].filtre = f.cle }
                                    .font(.caption.weight(.semibold))
                                    .padding(.horizontal, Espace.m).padding(.vertical, Espace.xs)
                                    .background(c.filtre == f.cle ? Color.white : Color.white.opacity(0.12), in: .capsule)
                                    .foregroundStyle(c.filtre == f.cle ? Color.black : .white)
                            }
                        }
                    }
                    HStack(spacing: Espace.l) {
                        Outil(icone: "scissors", libelle: "Scinder") { projet.scinder(a: temps) }
                        Outil(icone: c.muet ? "speaker.slash.fill" : "speaker.wave.2.fill", libelle: c.muet ? "Son coupé" : "Son") {
                            projet.clips[i].muet.toggle()
                        }
                        Outil(icone: "arrow.left", libelle: "Avant") { if i > 0 { projet.clips.swapAt(i, i - 1) } }
                            .disabled(i == 0)
                        Outil(icone: "arrow.right", libelle: "Après") { if i < projet.clips.count - 1 { projet.clips.swapAt(i, i + 1) } }
                            .disabled(i == projet.clips.count - 1)
                        Outil(icone: "trash", libelle: "Supprimer") { projet.clips.remove(at: i); selection = nil }
                            .disabled(projet.clips.count == 1)
                    }
                }
                .padding(.horizontal, Espace.l)
            }
        }
        .foregroundStyle(.white)
        .tint(.accent)
    }
}

private struct Outil: View {
    let icone: String
    let libelle: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Image(systemName: icone).font(.body)
                Text(libelle).font(.caption2)
            }
            .frame(minWidth: 52, minHeight: 44)
        }
        .buttonStyle(.plain)
    }
}

private struct ReglagesTextes: View {
    let projet: Projet
    let temps: Double
    let editer: (Projet.Texte) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Espace.s) {
            Button {
                editer(Projet.Texte(texte: "", debut: temps, fin: min(projet.dureeTotale, temps + 3)))
            } label: {
                Label("Ajouter un texte ici", systemImage: "textformat").font(.subheadline.weight(.semibold))
            }
            .disabled(projet.textes.count >= Projet.textesMax)
            List(projet.textes) { t in
                Button { editer(t) } label: {
                    HStack {
                        Text(t.texte).lineLimit(1)
                        Spacer()
                        Text("\(Frise.format(t.debut))–\(Frise.format(t.fin))").font(.caption).monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                }
                .listRowBackground(Color.white.opacity(0.08))
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
        }
        .padding(.horizontal, Espace.l)
        .foregroundStyle(.white)
    }
}

private struct EditionTexte: View {
    @State var texte: Projet.Texte
    let total: Double
    /// nil : supprimer.
    let fin: (Projet.Texte?) -> Void
    @Environment(\.dismiss) private var fermer

    var body: some View {
        NavigationStack {
            Form {
                Section { TextField("Texte à l’écran", text: $texte.texte, axis: .vertical).lineLimit(1...4) }
                Section {
                    Picker("Position", selection: $texte.position) {
                        Text("Haut").tag("haut"); Text("Milieu").tag("milieu"); Text("Bas").tag("bas")
                    }
                    Picker("Taille", selection: $texte.taille) {
                        Text("Petit").tag("s"); Text("Moyen").tag("m"); Text("Grand").tag("l")
                    }
                    Toggle("Bandeau noir", isOn: $texte.fond)
                }
                Section("Affiché de \(Frise.format(texte.debut)) à \(Frise.format(texte.fin))") {
                    Slider(value: Binding(get: { texte.debut }, set: { texte.debut = min($0, texte.fin - 0.2) }), in: 0...max(0.2, total))
                    Slider(value: Binding(get: { texte.fin }, set: { texte.fin = max($0, texte.debut + 0.2) }), in: 0...max(0.2, total))
                }
                Section { Button("Supprimer le texte", role: .destructive) { fin(nil); fermer() } }
            }
            .navigationTitle("Texte")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { fermer() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { texte.texte = String(texte.texte.prefix(120)); fin(texte); fermer() }
                        .disabled(texte.texte.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

private struct ReglagesSon: View {
    @Bindable var projet: Projet
    @State private var choix = false

    var body: some View {
        VStack(alignment: .leading, spacing: Espace.m) {
            Button { choix = true } label: {
                Label(projet.musique?.titre ?? "Ajouter un son", systemImage: "music.note").font(.subheadline.weight(.semibold))
            }
            if projet.musique != nil {
                Curseur(titre: "Musique", valeur: Binding(get: { projet.musique!.volume }, set: { projet.musique!.volume = $0 }))
                Curseur(titre: "Voix", valeur: Binding(get: { projet.musique!.voix }, set: { projet.musique!.voix = $0 }))
                HStack {
                    Text("Départ").font(.caption).frame(width: 64, alignment: .leading)
                    Slider(value: Binding(get: { projet.musique!.debut }, set: { projet.musique!.debut = $0 }), in: 0...25)
                    Text("\(Int(projet.musique!.debut)) s").font(.caption).monospacedDigit().frame(width: 36)
                }
            } else {
                Text("Une boucle de la bibliothèque, mixée sous ta voix au rendu.").font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, Espace.l)
        .foregroundStyle(.white)
        .sheet(isPresented: $choix) { ChoixMusique(projet: projet).presentationDetents([.medium]) }
    }

    private struct Curseur: View {
        let titre: String
        @Binding var valeur: Double
        var body: some View {
            HStack {
                Text(titre).font(.caption).frame(width: 64, alignment: .leading)
                Slider(value: $valeur, in: 0...1)
                Text("\(Int(valeur * 100)) %").font(.caption).monospacedDigit().frame(width: 36)
            }
        }
    }
}

private struct ReglageCouverture: View {
    @Bindable var projet: Projet
    let aller: (Double) -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: Espace.m) {
            Text("Image de couverture : celle affichée dans le fil et sur ton profil.")
                .font(.subheadline).foregroundStyle(.secondary)
            Slider(value: Binding(get: { projet.couverture }, set: { projet.couverture = $0; aller($0) }),
                   in: 0...max(0.1, projet.dureeTotale - 0.1))
            Text("À \(Frise.format(projet.couverture))").font(.caption).monospacedDigit()
        }
        .padding(.horizontal, Espace.l)
        .foregroundStyle(.white)
    }
}

// MARK: Publication

private struct PublicationVideoVue: View {
    let projet: Projet
    let publiee: () -> Void
    @Environment(Session.self) private var session
    @State private var titre = ""
    @State private var description = ""
    @State private var matiere: Int?
    @State private var matieres: [Matiere] = []
    @State private var progression: Double?
    @State private var erreur: String?

    var body: some View {
        Form {
            Section {
                TextField("Titre (« Les séries en 2 minutes »)", text: $titre)
                TextField("Description", text: $description, axis: .vertical).lineLimit(2...5)
                Picker("Matière", selection: $matiere) {
                    Text("Aucune").tag(Int?.none)
                    ForEach(matieres) { m in Text(m.nom).tag(Int?.some(m.id)) }
                }
            } footer: {
                Text("\(Frise.format(projet.dureeTotale)) · \(projet.clips.count) clip\(projet.clips.count > 1 ? "s" : "") · rendu sur le serveur en environ une minute.")
            }
            if let progression {
                Section {
                    ProgressView(value: progression) { Text(progression < 1 ? "Envoi…" : "Rendu en préparation…") }
                }
            }
            if let erreur { Section { Text(erreur).foregroundStyle(.red) } }
            Section {
                Button("Publier") { Task { await envoyer() } }
                    .font(.body.weight(.semibold))
                    .disabled(titre.trimmingCharacters(in: .whitespaces).isEmpty || titre.count > 120
                              || description.count > 1000 || progression != nil)
            }
        }
        .navigationTitle("Publier")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if let r: ReponseVideos = try? await session.api.get("api/app/videos", ["auteur": "moi"]) { matieres = r.matieres }
        }
        .interactiveDismissDisabled(progression != nil)
    }

    private func envoyer() async {
        progression = 0
        erreur = nil
        do {
            _ = try await Publication.envoyer(
                api: session.api, projet: projet.montage(),
                titre: titre.trimmingCharacters(in: .whitespaces),
                description: description.trimmingCharacters(in: .whitespacesAndNewlines),
                matiere: matiere) { p in Task { @MainActor in progression = p } }
            progression = 1
            publiee()
        } catch {
            session.signaler(error)
            erreur = error.localizedDescription
            progression = nil
        }
    }
}
