import AVFoundation
import SwiftUI

/*
 * Studio : on filme un ou plusieurs clips (3 minutes au total), avec un
 * filtre par clip qu'on change en glissant sur l'image. « Suivant » ouvre
 * l'éditeur, puis la publication.
 */
struct StudioVue: View {
    let publiee: () -> Void
    @Environment(\.dismiss) private var fermer
    @State private var projet = Projet()
    @State private var camera = Camera()
    @State private var filtre = FiltreVideo.tous[0]
    @State private var enCours = false
    @State private var dureeClip: Double = 0
    @State private var minuteur = false
    @State private var compte: Int?
    @State private var erreur: String?
    @State private var editer = false
    @State private var choixSon = false
    @State private var confirmerFermeture = false
    @State private var bande = Bande.filtres
    @State private var lentille: String?
    @State private var aide: String?

    private enum Bande { case filtres, lentilles }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.black.ignoresSafeArea()
                ApercuCamera(source: camera.apercu, filtre: filtre)
                    .ignoresSafeArea()
                    .gesture(DragGesture(minimumDistance: 24).onEnded(glisser))
                    .onTapGesture { camera.lentilles.toucherEcran() }
                if let erreur {
                    ContentUnavailableView("Caméra indisponible", systemImage: "video.slash", description: Text(erreur))
                        .foregroundStyle(.white)
                }
                if let compte {
                    Text("\(compte)")
                        .font(.system(size: 120, weight: .bold, design: .rounded))
                        .foregroundStyle(.white).shadow(radius: 12)
                        .contentTransition(.numericText(countsDown: true))
                }
                interface
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(isPresented: $editer) {
                EditeurVideoVue(projet: projet, publiee: { projet.nettoyer(); publiee(); fermer() })
            }
        }
        .environment(\.colorScheme, .dark)
        .statusBarHidden()
        .task { await preparer() }
        .onDisappear { camera.arreter() }
        .sheet(isPresented: $choixSon) { ChoixMusique(projet: projet).presentationDetents([.medium]) }
        .confirmationDialog("Abandonner cette vidéo ?", isPresented: $confirmerFermeture, titleVisibility: .visible) {
            Button("Abandonner", role: .destructive) { projet.nettoyer(); fermer() }
        } message: { Text("Les clips filmés seront effacés.") }
        .sensoryFeedback(.selection, trigger: filtre)
        .sensoryFeedback(.selection, trigger: lentille)
        .onChange(of: lentille) { _, cle in
            let type = Lentille.toutes.first { $0.cle == cle }
            camera.lentilles.choisir(type)
            withAnimation(.snappy) { aide = type?.aide }
            Task {
                try? await Task.sleep(for: .seconds(4))
                if lentille == cle { withAnimation(.snappy) { aide = nil } }
            }
        }
        .sensoryFeedback(.impact(weight: .heavy), trigger: enCours)
    }

    private var interface: some View {
        VStack(spacing: 0) {
            // Segments : un par clip, sur les 3 minutes.
            Segments(projet: projet, enCours: enCours ? dureeClip : nil)
                .padding(.horizontal, Espace.l).padding(.top, Espace.s)

            HStack {
                RondVerre(icone: "xmark", libelle: "Fermer") {
                    projet.clips.isEmpty ? fermer() : (confirmerFermeture = true)
                }
                Spacer()
                Button { choixSon = true } label: {
                    Label(projet.musique?.titre ?? "Ajouter un son", systemImage: "music.note")
                        .font(.subheadline.weight(.semibold)).lineLimit(1)
                        .padding(.horizontal, Espace.m).frame(minHeight: 36)
                        .background(.ultraThinMaterial, in: .capsule)
                }
                Spacer()
                RondVerre(icone: "arrow.triangle.2.circlepath.camera", libelle: "Changer de caméra") {
                    camera.basculer()
                }
                .disabled(enCours)
            }
            .padding(.horizontal, Espace.l).padding(.top, Espace.m)

            HStack {
                Spacer()
                VStack(spacing: Espace.l) {
                    RondVerre(icone: minuteur ? "timer.circle.fill" : "timer", libelle: minuteur ? "Minuteur 3 s activé" : "Minuteur 3 s") {
                        minuteur.toggle()
                    }
                    if !projet.clips.isEmpty && !enCours {
                        RondVerre(icone: "arrow.uturn.backward", libelle: "Effacer le dernier clip") {
                            withAnimation(.snappy) { projet.retirerDernier() }
                        }
                    }
                }
            }
            .padding(.horizontal, Espace.l).padding(.top, Espace.l)

            Spacer()

            if let aide {
                Text(aide).font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                    .multilineTextAlignment(.center).padding(.horizontal, Espace.m).padding(.vertical, Espace.s)
                    .background(.black.opacity(0.45), in: .capsule).padding(.horizontal, Espace.xl)
                    .transition(.opacity).padding(.bottom, Espace.s)
            }
            Picker("Effets", selection: $bande) {
                Text("Filtres").tag(Bande.filtres)
                Text("Lentilles").tag(Bande.lentilles)
            }
            .pickerStyle(.segmented).frame(width: 220).padding(.bottom, Espace.s)
            if bande == .filtres {
                Text(filtre.libelle)
                    .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                    .shadow(radius: 4).id(filtre.cle).transition(.opacity)
                    .padding(.bottom, Espace.s)
                BandeFiltres(filtre: $filtre).padding(.bottom, Espace.l)
            } else {
                BandeLentilles(choisie: $lentille).padding(.bottom, Espace.l)
            }

            HStack {
                Text(projet.resteAFilmer < Projet.dureeMax ? "\(Int(projet.resteAFilmer - (enCours ? dureeClip : 0))) s" : "3 min")
                    .font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(.white.opacity(0.8))
                    .frame(width: 72)
                Spacer()
                BoutonEnregistrer(enCours: enCours, progression: progressionTotale) { Task { await basculer() } }
                    .disabled(compte != nil || erreur != nil || (projet.resteAFilmer < 0.5 && !enCours))
                Spacer()
                Button { editer = true } label: {
                    Text("Suivant").font(.subheadline.weight(.semibold))
                        .padding(.horizontal, Espace.l).frame(minHeight: 44)
                        .background(Color.accent, in: .capsule).foregroundStyle(.white)
                }
                .frame(width: 96)
                .opacity(projet.clips.isEmpty || enCours ? 0 : 1)
                .disabled(projet.clips.isEmpty || enCours)
            }
            .padding(.horizontal, Espace.l).padding(.bottom, Espace.l)
        }
        .animation(.snappy, value: filtre)
        .animation(.snappy, value: projet.clips.count)
    }

    private var progressionTotale: Double {
        (Projet.dureeMax - projet.resteAFilmer + (enCours ? dureeClip : 0)) / Projet.dureeMax
    }

    private func preparer() async {
        camera.surDuree = { d in
            dureeClip = d
            if d >= projet.resteAFilmer && enCours { Task { await arreter() } }   // 3 minutes atteintes : on coupe
        }
        do { try await camera.configurer(); camera.demarrer() }
        catch { erreur = error.localizedDescription }
    }

    private func basculer() async {
        if enCours { await arreter() } else { await commencer() }
    }

    /// N'agit qu'une fois : les appels suivants (images encore en vol) ne font rien.
    private func arreter() async {
        guard enCours else { return }
        enCours = false
        if let (url, duree) = await camera.finir() {
            withAnimation(.snappy) { projet.ajouter(url: url, duree: min(duree, projet.resteAFilmer), filtre: filtre.cle) }
        }
        dureeClip = 0
    }

    private func commencer() async {
        guard !enCours, compte == nil else { return }
        if minuteur {
            for n in stride(from: 3, through: 1, by: -1) {
                withAnimation(.snappy) { compte = n }
                try? await Task.sleep(for: .seconds(1))
            }
            compte = nil
        }
        camera.commencer()
        enCours = true
    }

    private func glisser(_ g: DragGesture.Value) {
        guard abs(g.translation.width) > abs(g.translation.height),
              let i = FiltreVideo.tous.firstIndex(of: filtre) else { return }
        let n = FiltreVideo.tous.count
        filtre = FiltreVideo.tous[(i + (g.translation.width < 0 ? 1 : -1) + n) % n]
    }
}

private struct Segments: View {
    let projet: Projet
    let enCours: Double?
    var body: some View {
        GeometryReader { geo in
            HStack(spacing: 2) {
                ForEach(projet.clips) { c in
                    Capsule().fill(.white).frame(width: max(2, geo.size.width * c.dureeSource / Projet.dureeMax))
                }
                if let enCours {
                    Capsule().fill(Color.red).frame(width: max(2, geo.size.width * enCours / Projet.dureeMax))
                }
                Spacer(minLength: 0)
            }
            .frame(height: 4)
            .background(Capsule().fill(.white.opacity(0.25)))
        }
        .frame(height: 4)
        .accessibilityHidden(true)
    }
}

private struct BandeFiltres: View {
    @Binding var filtre: FiltreVideo
    var body: some View {
        ScrollViewReader { lecteur in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Espace.m) {
                    ForEach(FiltreVideo.tous) { f in
                        Button { filtre = f } label: {
                            Circle()
                                .fill(AngularGradient(colors: Self.teintes(f), center: .center))
                                .frame(width: f == filtre ? 52 : 40, height: f == filtre ? 52 : 40)
                                .overlay(Circle().strokeBorder(.white, lineWidth: f == filtre ? 3 : 1))
                        }
                        .id(f.cle)
                        .accessibilityLabel("Filtre \(f.libelle)")
                    }
                }
                .padding(.horizontal, Espace.xxl)
            }
            .onChange(of: filtre) { _, f in withAnimation(.snappy) { lecteur.scrollTo(f.cle, anchor: .center) } }
        }
        .frame(height: 56)
    }

    /// Pastille évocatrice de chaque filtre (aperçu de couleur, pas une image).
    private static func teintes(_ f: FiltreVideo) -> [Color] {
        switch f.cle {
        case "aucun": [.white.opacity(0.9), .gray]
        case "nb", "tableau": [.white, .black]
        case "negatif": [.cyan, .purple]
        case "nuit": [.blue, .indigo]
        case "matrix": [.green, .black]
        case "chaud", "vintage": [.orange, .brown]
        case "cine": [.teal, .orange]
        case "pop": [.pink, .yellow]
        case "reve": [.pink, .purple]
        default: [.yellow, .orange, .pink]
        }
    }
}

private struct BoutonEnregistrer: View {
    let enCours: Bool
    let progression: Double
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            ZStack {
                Circle().stroke(.white.opacity(0.35), lineWidth: 6)
                Circle().trim(from: 0, to: progression).stroke(Color.red, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                RoundedRectangle(cornerRadius: enCours ? 8 : 34, style: .continuous)
                    .fill(Color.red)
                    .frame(width: enCours ? 32 : 66, height: enCours ? 32 : 66)
            }
            .frame(width: 84, height: 84)
            .animation(.snappy(duration: 0.2), value: enCours)
        }
        .accessibilityLabel(enCours ? "Arrêter le clip" : "Filmer un clip")
    }
}

struct RondVerre: View {
    let icone: String
    let libelle: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: icone).font(.body.weight(.semibold)).foregroundStyle(.white)
                .frame(width: 44, height: 44).background(.ultraThinMaterial, in: .circle)
        }
        .accessibilityLabel(libelle)
    }
}

/// Choix d'un son de la bibliothèque (écouté avant de le prendre).
struct ChoixMusique: View {
    let projet: Projet
    @Environment(\.dismiss) private var fermer
    @State private var lecteur = AVPlayer()
    @State private var ecoute: String?

    var body: some View {
        NavigationStack {
            List {
                if projet.musique != nil {
                    Button("Sans musique", role: .destructive) { projet.musique = nil; fermer() }
                }
                ForEach(Projet.musiques, id: \.cle) { m in
                    HStack(spacing: Espace.m) {
                        Button {
                            if ecoute == m.cle { lecteur.pause(); ecoute = nil; return }
                            lecteur.replaceCurrentItem(with: AVPlayerItem(url: API.base.appending(path: "musique/\(m.cle).m4a")))
                            lecteur.play(); ecoute = m.cle
                        } label: {
                            Image(systemName: ecoute == m.cle ? "pause.circle.fill" : "play.circle.fill")
                                .font(.title).foregroundStyle(Color.accent)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(ecoute == m.cle ? "Arrêter l’écoute" : "Écouter \(m.titre)")
                        VStack(alignment: .leading, spacing: 2) {
                            Text(m.titre).font(.body)
                            Text(m.ambiance).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Choisir") {
                            projet.musique = Projet.Musique(cle: m.cle, titre: m.titre)
                            fermer()
                        }
                        .buttonStyle(.bordered)
                        .tint(projet.musique?.cle == m.cle ? .green : .accent)
                    }
                }
            }
            .navigationTitle("Ajouter un son")
            .navigationBarTitleDisplayMode(.inline)
        }
        .onDisappear { lecteur.pause() }
    }
}

/// Lentilles du studio (effets sur le visage, gravés dans le clip). Toucher la lentille active la retire.
private struct BandeLentilles: View {
    @Binding var choisie: String?
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: Espace.m) {
                Button { choisie = nil } label: {
                    Image(systemName: "nosign").font(.title3).foregroundStyle(.white)
                        .frame(width: 48, height: 48).background(.ultraThinMaterial, in: .circle)
                        .overlay(Circle().strokeBorder(.white, lineWidth: choisie == nil ? 3 : 0))
                }
                .accessibilityLabel("Sans lentille")
                ForEach(Lentille.toutes.map { ($0.cle, $0.nom, $0.icone) }, id: \.0) { cle, nom, icone in
                    Button { choisie = choisie == cle ? nil : cle } label: {
                        VStack(spacing: 2) {
                            Text(icone).font(.system(size: 26))
                                .frame(width: 48, height: 48).background(.ultraThinMaterial, in: .circle)
                                .overlay(Circle().strokeBorder(.white, lineWidth: choisie == cle ? 3 : 0))
                            Text(nom).font(.caption2).foregroundStyle(.white).lineLimit(1).frame(width: 72)
                        }
                    }
                    .accessibilityLabel("Lentille \(nom)")
                }
            }
            .padding(.horizontal, Espace.l)
        }
        .frame(height: 72)
    }
}
