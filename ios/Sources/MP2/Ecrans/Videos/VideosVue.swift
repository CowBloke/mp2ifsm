import AVFoundation
import SwiftUI

/*
 * Onglet Détente : le fil des vidéos de la classe, plein écran, page par
 * page. Le menu du haut mène aux autres rubriques du divertissement.
 */
struct VideosVue: View {
    @State private var matiere: Matiere?
    @State private var profil: String?
    @State private var studio = false
    @State private var marche = false
    @State private var reels = false
    @State private var toilet = false
    @Environment(Session.self) private var session

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                Color.black.ignoresSafeArea()
                Chargement(cle: matiere?.id ?? 0) { [matiere] api in
                    try await api.get("api/app/videos", ["matiere": matiere.map { String($0.id) }]) as ReponseVideos
                } contenu: { r, recharger in
                    if r.videos.isEmpty {
                        VideVideos(filtre: matiere) { studio = true }
                    } else {
                        FilVideos(videos: r.videos, matiere: $matiere, profil: $profil)
                            .id(matiere?.id ?? 0)
                    }
                }
                EnTeteFil(matiere: $matiere, profil: $profil, filmer: { studio = true },
                          ouvrirMarche: { marche = true }, ouvrirReels: { reels = true },
                          ouvrirToilet: session.utilisateur?.toilet == true ? { toilet = true } : nil)
            }
            .navigationDestination(item: $profil) { id in ProfilVideosVue(auteur: id) }
            .toolbar(.hidden, for: .navigationBar)
            .fullScreenCover(isPresented: $studio) { StudioVue { profil = "moi" } }
            .fullScreenCover(isPresented: $reels) { ReelsVue(pseudo: session.utilisateur?.displayName ?? "toi") }
        }
        .toolbarBackground(.black, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
        .toolbarColorScheme(.dark, for: .tabBar)
        .environment(\.colorScheme, .dark)
        // Hors de la zone sombre du fil : le Marché suit le thème du téléphone.
        .sheet(isPresented: $marche) { MarcheVue() }
        .fullScreenCover(isPresented: $toilet) { ToiletVue() }
    }
}

private struct EnTeteFil: View {
    @Binding var matiere: Matiere?
    @Binding var profil: String?
    let filmer: () -> Void
    let ouvrirMarche: () -> Void
    let ouvrirReels: () -> Void
    /// nil hors membres : la rubrique cachée n'apparaît pas.
    let ouvrirToilet: (() -> Void)?

    var body: some View {
        HStack(spacing: Espace.s) {
            Menu {
                Button("Réels", systemImage: "number", action: ouvrirReels)
                Button("Marché", systemImage: "chart.line.uptrend.xyaxis", action: ouvrirMarche)
                if let ouvrirToilet { Button("Toilet!", systemImage: "toilet", action: ouvrirToilet) }
            } label: {
                HStack(spacing: Espace.xs) {
                    Text("Vidéos").font(.title3.weight(.semibold))
                    Image(systemName: "chevron.down").font(.caption.weight(.bold))
                }
            }
            if let m = matiere {
                Button { withAnimation(.snappy) { matiere = nil } } label: {
                    HStack(spacing: Espace.xs) {
                        Text(m.nom)
                        Image(systemName: "xmark").font(.caption2.weight(.bold))
                    }
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, Espace.m).frame(minHeight: 32)
                    .background(.ultraThinMaterial, in: .capsule)
                }
                .accessibilityLabel("Retirer le filtre \(m.nom)")
            }
            Spacer()
            Button { profil = "moi" } label: { Image(systemName: "person.crop.circle").font(.title2) }
                .accessibilityLabel("Mon profil vidéo")
            Button(action: filmer) {
                Image(systemName: "plus").font(.body.weight(.bold))
                    .frame(width: 36, height: 36)
                    .background(.white, in: .circle)
                    .foregroundStyle(.black)
            }
            .accessibilityLabel("Filmer une vidéo")
        }
        .foregroundStyle(.white)
        .shadow(color: .black.opacity(0.35), radius: 6)
        .padding(.horizontal, Espace.l)
        .padding(.top, Espace.xs)
    }
}

private struct VideVideos: View {
    let filtre: Matiere?
    let filmer: () -> Void
    var body: some View {
        ContentUnavailableView {
            Label(filtre == nil ? "Aucune vidéo pour l’instant" : "Aucune vidéo en \(filtre!.nom)", systemImage: "play.rectangle")
        } description: {
            Text("Explique une notion à la classe en moins de trois minutes.")
        } actions: {
            Button("Filmer une vidéo", action: filmer).buttonStyle(.borderedProminent)
        }
        .foregroundStyle(.white)
    }
}

// MARK: Fil

struct FilVideos: View {
    @State private var liste: [Video]
    @Binding var matiere: Matiere?
    @Binding var profil: String?
    var depart: Int? = nil

    @Environment(Session.self) private var session
    @Environment(\.scenePhase) private var phase
    @State private var lecteurs = Lecteurs()
    @State private var courante: Int?
    @State private var commentaires: Video?

    init(videos: [Video], matiere: Binding<Matiere?>, profil: Binding<String?>, depart: Int? = nil) {
        _liste = State(initialValue: videos)
        _matiere = matiere
        _profil = profil
        self.depart = depart
    }

    var body: some View {
        ScrollView(.vertical) {
            LazyVStack(spacing: 0) {
                ForEach(Array(liste.enumerated()), id: \.element.id) { i, v in
                    PageVideo(video: $liste[i], index: i, lecteurs: lecteurs, active: courante == v.id,
                              filtrer: { m in withAnimation(.snappy) { matiere = m } },
                              ouvrirProfil: { profil = v.auteurId },
                              ouvrirCommentaires: { commentaires = liste[i] })
                        .containerRelativeFrame([.horizontal, .vertical])
                        .id(v.id)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $courante)
        .scrollIndicators(.hidden)
        .ignoresSafeArea(edges: .top)
        .background(.black)
        .onAppear {
            Lecteurs.activerSon()
            if courante == nil { courante = depart ?? liste.first?.id }
            preparer()
        }
        .onChange(of: courante) { preparer() }
        .onDisappear { lecteurs.toutArreter() }
        .onChange(of: phase) { _, p in p == .active ? lecteurs.reprendre() : lecteurs.toutArreter() }
        .sheet(item: $commentaires) { v in
            CommentairesVue(video: v) { n in
                if let i = liste.firstIndex(where: { $0.id == v.id }) { liste[i].commentaires = n }
            }
            .presentationDetents([.medium, .large])
            .presentationBackground(.regularMaterial)
        }
        .sensoryFeedback(.selection, trigger: courante)
    }

    private func preparer() {
        guard let id = courante, let i = liste.firstIndex(where: { $0.id == id }) else { return }
        lecteurs.preparer(liste, index: i, jeton: session.api.jeton)
    }
}

/// Une page du fil : vidéo, actions à droite, texte en bas, barre de temps.
private struct PageVideo: View {
    @Binding var video: Video
    let index: Int
    let lecteurs: Lecteurs
    let active: Bool
    let filtrer: (Matiere) -> Void
    let ouvrirProfil: () -> Void
    let ouvrirCommentaires: () -> Void

    @Environment(Session.self) private var session
    @State private var prete = false
    @State private var portrait = true
    @State private var coeurs: [Coeur] = []
    @State private var vueComptee = false
    @State private var jaime = 0

    private struct Coeur: Identifiable { let id = UUID(); let position: CGPoint }

    private var couverture: URL {
        var c = URLComponents(url: API.base.appending(path: "api/videos/\(video.id)"), resolvingAgainstBaseURL: false)!
        c.queryItems = [URLQueryItem(name: "couverture", value: "1")]
        return c.url!
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                // Couverture : visible jusqu'à la première image (jamais d'écran noir), floutée derrière un paysage.
                ImageDistante(url: couverture)
                    .frame(width: geo.size.width, height: geo.size.height)
                    .clipped()
                    .blur(radius: portrait ? 0 : 40)
                    .opacity(prete && portrait ? 0 : 1)

                CoucheVideo(joueur: lecteurs.lecteurCharge(pour: video.id), prete: $prete, portrait: $portrait)
                    .frame(width: geo.size.width, height: geo.size.height)
                    .opacity(prete ? 1 : 0)

                // Dégradés discrets pour lire le texte blanc sur n'importe quelle image.
                VStack {
                    LinearGradient(colors: [.black.opacity(0.45), .clear], startPoint: .top, endPoint: .bottom).frame(height: 140)
                    Spacer()
                    LinearGradient(colors: [.clear, .black.opacity(0.6)], startPoint: .top, endPoint: .bottom).frame(height: 280)
                }
                .allowsHitTesting(false)

                if active && lecteurs.enPause {
                    Image(systemName: "play.fill")
                        .font(.system(size: 64))
                        .foregroundStyle(.white.opacity(0.85))
                        .shadow(radius: 12)
                        .transition(.scale(scale: 1.3).combined(with: .opacity))
                        .allowsHitTesting(false)
                }

                ForEach(coeurs) { c in
                    CoeurVolant().position(c.position)
                }

                VStack(spacing: 0) {
                    Spacer()
                    HStack(alignment: .bottom, spacing: Espace.l) {
                        Legende(video: video, filtrer: filtrer, ouvrirProfil: ouvrirProfil)
                        Spacer(minLength: 0)
                        Actions(video: video, aimer: { Task { await aimer(!video.aime) } },
                                commentaires: ouvrirCommentaires, profil: ouvrirProfil)
                    }
                    .padding(.horizontal, Espace.l)
                    .padding(.bottom, Espace.m)
                    BarreTemps(joueur: active ? lecteurs.lecteurCharge(pour: video.id) : nil)
                }
                .padding(.bottom, geo.safeAreaInsets.bottom)
            }
            .contentShape(.rect)
            .onTapGesture(count: 2) { point in
                coeurs.append(Coeur(position: point))
                if !video.aime { Task { await aimer(true) } }
                jaime += 1
                let id = coeurs.last!.id
                Task { try? await Task.sleep(for: .seconds(1)); coeurs.removeAll { $0.id == id } }
            }
            .onTapGesture { withAnimation(.snappy(duration: 0.2)) { lecteurs.basculerPause() } }
        }
        .sensoryFeedback(.impact(weight: .medium), trigger: jaime)
        .task(id: active) {
            // Une vue compte après deux secondes de lecture, une fois par membre.
            guard active, !vueComptee else { return }
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            vueComptee = true
            _ = try? await session.api.envoyer("PATCH", "api/app/videos/\(video.id)", ["vue": true])
        }
    }

    private func aimer(_ aime: Bool) async {
        let avant = video
        withAnimation(.snappy) {            // optimiste : le cœur réagit tout de suite
            video.aime = aime
            video.likes += aime ? 1 : -1
        }
        do {
            let r: ReponseJaime = try await session.api.envoyer("PATCH", "api/app/videos/\(video.id)", ["aime": aime])
            video.likes = r.likes
            video.aime = r.aime
        } catch {
            session.signaler(error)
            withAnimation(.snappy) { video = avant }
        }
    }
}

private struct CoucheVideo: UIViewRepresentable {
    let joueur: AVPlayer?
    @Binding var prete: Bool
    @Binding var portrait: Bool

    func makeUIView(context: Context) -> VueLecteur {
        let v = VueLecteur()
        v.surPrete = { p in if prete != p { prete = p } }
        v.surFormat = { p in if portrait != p { portrait = p } }
        return v
    }

    func updateUIView(_ v: VueLecteur, context: Context) {
        v.joueur = joueur
    }
}

private struct Legende: View {
    let video: Video
    let filtrer: (Matiere) -> Void
    let ouvrirProfil: () -> Void
    @State private var deplie = false

    var body: some View {
        VStack(alignment: .leading, spacing: Espace.s) {
            Button(action: ouvrirProfil) { Text("@\(video.auteur)").font(.body.weight(.semibold)) }
            Text(video.titre).font(.body.weight(.semibold))
            if !video.description.isEmpty {
                Text(video.description)
                    .font(.subheadline)
                    .lineLimit(deplie ? 8 : 2)
                    .onTapGesture { withAnimation(.snappy) { deplie.toggle() } }
            }
            HStack(spacing: Espace.s) {
                if let nom = video.matiere, let id = video.matiereId {
                    Button { filtrer(Matiere(id: id, nom: nom, couleur: video.couleur)) } label: {
                        Text(nom).font(.caption.weight(.semibold))
                            .padding(.horizontal, Espace.s).padding(.vertical, Espace.xs)
                            .background(.ultraThinMaterial, in: .capsule)
                    }
                }
                if let m = video.musique {
                    Label(m, systemImage: "music.note").font(.caption).lineLimit(1)
                }
            }
        }
        .foregroundStyle(.white)
        .shadow(color: .black.opacity(0.4), radius: 4)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct Actions: View {
    let video: Video
    let aimer: () -> Void
    let commentaires: () -> Void
    let profil: () -> Void

    var body: some View {
        VStack(spacing: Espace.xl) {
            Button(action: profil) {
                Text(video.auteur.prefix(1).uppercased())
                    .font(.title3.weight(.semibold))
                    .frame(width: 48, height: 48)
                    .background(Color.accent, in: .circle)
                    .overlay(Circle().strokeBorder(.white, lineWidth: 2))
            }
            .accessibilityLabel("Profil de \(video.auteur)")
            Bouton(icone: video.aime ? "heart.fill" : "heart", valeur: video.likes,
                   teinte: video.aime ? .pink : .white, action: aimer)
                .accessibilityLabel(video.aime ? "Je n’aime plus" : "J’aime")
            Bouton(icone: "bubble.right.fill", valeur: video.commentaires, teinte: .white, action: commentaires)
                .accessibilityLabel("Commentaires")
            VStack(spacing: 2) {
                Image(systemName: "eye.fill").font(.title3)
                Text(video.vues.formatted(.number.notation(.compactName).locale(Paris.langue))).font(.caption.weight(.semibold))
            }
            .accessibilityElement(children: .combine)
        }
        .foregroundStyle(.white)
        .shadow(color: .black.opacity(0.4), radius: 4)
    }

    private struct Bouton: View {
        let icone: String
        let valeur: Int
        let teinte: Color
        let action: () -> Void
        var body: some View {
            Button(action: action) {
                VStack(spacing: 2) {
                    Image(systemName: icone)
                        .font(.system(size: 30))
                        .foregroundStyle(teinte)
                        .contentTransition(.symbolEffect(.replace))
                        .symbolEffect(.bounce, value: teinte == .pink)
                    Text(valeur.formatted(.number.notation(.compactName).locale(Paris.langue)))
                        .font(.caption.weight(.semibold))
                        .contentTransition(.numericText())
                }
                .frame(minWidth: 48, minHeight: 48)
            }
        }
    }
}

/// Barre de temps fine ; on la fait glisser pour se déplacer dans la vidéo.
private struct BarreTemps: View {
    let joueur: AVPlayer?
    @State private var progression: Double = 0
    @State private var glisse = false
    /// Le lecteur sur lequel l'observateur a été posé : on ne le retire que de celui-là.
    @State private var observation: (joueur: AVPlayer, jeton: Any)?

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.25))
                Capsule().fill(.white).frame(width: max(0, geo.size.width * progression))
            }
            .frame(height: glisse ? 6 : 2)
            .frame(maxHeight: .infinity)
            .contentShape(.rect)
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { g in
                    glisse = true
                    progression = min(1, max(0, g.location.x / geo.size.width))
                }
                .onEnded { _ in
                    if let joueur, let d = joueur.currentItem?.duration, d.isNumeric {
                        joueur.seek(to: CMTime(seconds: d.seconds * progression, preferredTimescale: 600),
                                    toleranceBefore: .zero, toleranceAfter: .zero)
                    }
                    glisse = false
                })
            .animation(.snappy(duration: 0.15), value: glisse)
        }
        .frame(height: 24)
        .padding(.horizontal, Espace.s)
        .onAppear { observer() }
        .onChange(of: joueur) { observer() }
        .onDisappear { retirer() }
        .accessibilityLabel("Position dans la vidéo")
        .accessibilityValue("\(Int(progression * 100)) %")
    }

    private func observer() {
        retirer()
        guard let joueur else { progression = 0; return }
        let j = joueur
        let jeton = joueur.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 30), queue: .main) { t in
            MainActor.assumeIsolated {
                guard !glisse, let d = j.currentItem?.duration, d.isNumeric, d.seconds > 0 else { return }
                progression = t.seconds / d.seconds
            }
        }
        observation = (joueur, jeton)
    }

    private func retirer() {
        if let observation { observation.joueur.removeTimeObserver(observation.jeton) }
        observation = nil
    }
}

private struct CoeurVolant: View {
    @State private var parti = false
    @State private var angle = Double.random(in: -15...15)
    var body: some View {
        Image(systemName: "heart.fill")
            .font(.system(size: 96))
            .foregroundStyle(.pink.gradient)
            .shadow(color: .pink.opacity(0.5), radius: 16)
            .rotationEffect(.degrees(angle))
            .scaleEffect(parti ? 1.25 : 0.4)
            .opacity(parti ? 0 : 1)
            .offset(y: parti ? -80 : 0)
            .onAppear { withAnimation(.easeOut(duration: 0.8)) { parti = true } }
            .allowsHitTesting(false)
    }
}
