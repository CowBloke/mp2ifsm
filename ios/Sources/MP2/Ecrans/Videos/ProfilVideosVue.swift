import SwiftUI

/// Profil vidéo d'un membre (`moi` pour soi) : compteurs, grille de couvertures, puis son fil.
struct ProfilVideosVue: View {
    let auteur: String
    @State private var ouverte: Video?

    var body: some View {
        Chargement(cle: auteur) { [auteur] api in
            try await api.get("api/app/videos", ["auteur": auteur]) as ReponseVideos
        } contenu: { r, recharger in
            ScrollView {
                VStack(spacing: Espace.xl) {
                    if let p = r.profil { EnTete(profil: p) }
                    if !r.enCours.isEmpty { EnMontage(videos: r.enCours) }
                    if r.videos.isEmpty {
                        ContentUnavailableView("Aucune vidéo publiée", systemImage: "video.slash")
                    } else {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 3), spacing: 2) {
                            ForEach(r.videos) { v in
                                Button { ouverte = v } label: { Vignette(video: v) }.buttonStyle(.plain)
                            }
                        }
                    }
                }
                .padding(.vertical, Espace.l)
            }
            .refreshable { await recharger() }
            .fullScreenCover(item: $ouverte) { v in
                FilProfil(videos: r.videos, depart: v.id)
            }
            .navigationTitle(r.profil.map { "@\($0.pseudo)" } ?? "Profil")
        }
        .background(Color.black)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
    }
}

private struct EnTete: View {
    let profil: ProfilVideos
    var body: some View {
        VStack(spacing: Espace.l) {
            Text(profil.pseudo.prefix(1).uppercased())
                .font(.system(size: 36, weight: .semibold, design: .rounded))
                .frame(width: 88, height: 88)
                .background(Color.accent, in: .circle)
            HStack(spacing: Espace.xxl) {
                Stat(valeur: profil.videos, libelle: "vidéos")
                Stat(valeur: profil.likes, libelle: "j’aime")
                Stat(valeur: profil.vues, libelle: "vues")
            }
        }
        .foregroundStyle(.white)
    }

    private struct Stat: View {
        let valeur: Int
        let libelle: String
        var body: some View {
            VStack(spacing: 2) {
                Text(valeur.formatted(.number.notation(.compactName).locale(Paris.langue)))
                    .font(.title3.weight(.semibold)).monospacedDigit()
                Text(libelle).font(.caption).foregroundStyle(.white.opacity(0.7))
            }
        }
    }
}

private struct Vignette: View {
    let video: Video
    var body: some View {
        Color.white.opacity(0.06)
            .aspectRatio(9 / 16, contentMode: .fit)
            .overlay {
                ImageDistante(url: URL(string: "\(API.base.absoluteString)/api/videos/\(video.id)?couverture=1")!)
            }
            .clipped()
            .overlay(alignment: .bottomLeading) {
                Label(video.vues.formatted(.number.notation(.compactName).locale(Paris.langue)), systemImage: "play.fill")
                    .font(.caption.weight(.semibold)).foregroundStyle(.white)
                    .shadow(radius: 3).padding(Espace.s)
            }
            .accessibilityLabel(video.titre)
    }
}

/// Fil limité aux vidéos du profil, ouvert sur celle touchée.
private struct FilProfil: View {
    let videos: [Video]
    let depart: Int
    @Environment(\.dismiss) private var fermer
    @State private var matiere: Matiere?
    @State private var profil: String?

    var body: some View {
        ZStack(alignment: .topLeading) {
            FilVideos(videos: videos, matiere: $matiere, profil: $profil, depart: depart)
            Button { fermer() } label: {
                Image(systemName: "chevron.down").font(.body.weight(.bold)).foregroundStyle(.white)
                    .frame(width: 44, height: 44).background(.ultraThinMaterial, in: .circle)
            }
            .padding(.leading, Espace.l)
            .accessibilityLabel("Fermer")
        }
        .background(.black)
        .environment(\.colorScheme, .dark)
        // Sur un profil, toucher l'auteur ou une matière referme simplement le fil.
        .onChange(of: profil) { fermer() }
        .onChange(of: matiere) { fermer() }
    }
}

/// Mes vidéos encore en rendu sur le serveur (ou en échec), au-dessus de la grille.
private struct EnMontage: View {
    let videos: [ReponseVideos.EnCours]
    var body: some View {
        VStack(alignment: .leading, spacing: Espace.s) {
            ForEach(videos) { v in
                HStack(spacing: Espace.m) {
                    if v.statut == "echec" {
                        Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                    } else {
                        ProgressView().tint(.white)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(v.titre).font(.subheadline.weight(.semibold))
                        Text(v.statut == "echec" ? "Le rendu a échoué : refilme-la ou réessaie plus tard."
                                                 : "En montage sur le serveur… tire pour actualiser.")
                            .font(.caption).foregroundStyle(.white.opacity(0.7))
                    }
                }
                .padding(Espace.m)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.white.opacity(0.08), in: .rect(cornerRadius: 12, style: .continuous))
            }
        }
        .foregroundStyle(.white)
        .padding(.horizontal, Espace.l)
    }
}
