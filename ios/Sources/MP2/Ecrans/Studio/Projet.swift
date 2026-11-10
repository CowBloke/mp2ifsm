import AVFoundation
import CoreImage
import Observation

/*
 * Projet du studio : les clips filmés et la description du montage,
 * exactement le schéma `schemaMontage` du serveur (videos-montage.ts).
 * Rien n'est réencodé ici : on envoie les clips bruts et ce montage, le
 * Pi fait le rendu (ffmpeg), comme pour le studio du site.
 */
@MainActor @Observable
final class Projet {
    struct Clip: Identifiable, Hashable {
        let id = UUID()
        let url: URL
        let dureeSource: Double
        var debut: Double
        var fin: Double
        var muet = false
        var filtre: String
        var duree: Double { fin - debut }
    }

    struct Texte: Identifiable, Hashable {
        let id = UUID()
        var texte: String
        var debut: Double
        var fin: Double
        var position = "bas"          // haut | milieu | bas
        var taille = "m"              // s | m | l
        var fond = true
    }

    struct Musique: Hashable {
        let cle: String
        let titre: String
        var debut: Double = 0
        var volume: Double = 0.6
        var voix: Double = 1
    }

    static let dureeMax: Double = 180
    static let clipMin: Double = 0.3
    static let textesMax = 10
    static let clipsMax = 20

    /// Bibliothèque du site (`public/musique`, sons synthétisés, sans droits tiers).
    static let musiques: [(cle: String, titre: String, ambiance: String)] = [
        ("lofi", "Lo-fi révision", "Calme · concentration"),
        ("piano", "Piano calme", "Doux · explication"),
        ("synthwave", "Synthwave nuit", "Rétro · motivant"),
        ("chiptune", "Chiptune bonus", "8 bits · fun"),
        ("energie", "Énergie", "House · dynamique"),
    ]

    var clips: [Clip] = []
    var textes: [Texte] = []
    var musique: Musique?
    var couverture: Double = 0

    var dureeTotale: Double { clips.reduce(0) { $0 + $1.duree } }
    var resteAFilmer: Double { max(0, Self.dureeMax - clips.reduce(0) { $0 + $1.dureeSource }) }

    func ajouter(url: URL, duree: Double, filtre: String) {
        clips.append(Clip(url: url, dureeSource: duree, debut: 0, fin: duree, filtre: filtre))
    }

    func retirerDernier() {
        guard let c = clips.popLast() else { return }
        if !clips.contains(where: { $0.url == c.url }) { try? FileManager.default.removeItem(at: c.url) }
    }

    /// Coupe un clip à `instant` (temps du montage) : deux clips sur la même source.
    func scinder(a instant: Double) {
        var t = 0.0
        for (i, c) in clips.enumerated() {
            if instant > t + Self.clipMin && instant < t + c.duree - Self.clipMin {
                var a = c, b = Clip(url: c.url, dureeSource: c.dureeSource, debut: 0, fin: 0, muet: c.muet, filtre: c.filtre)
                a.fin = c.debut + (instant - t)
                b.debut = a.fin
                b.fin = c.fin
                clips.replaceSubrange(i...i, with: [a, b])
                return
            }
            t += c.duree
        }
    }

    /// Clip joué à l'instant `t` du montage, et le temps dans ce clip.
    func clip(a t: Double) -> (Clip, Double)? {
        var debut = 0.0
        for c in clips {
            if t < debut + c.duree { return (c, t - debut) }
            debut += c.duree
        }
        return clips.last.map { ($0, $0.duree) }
    }

    func nettoyer() {
        for u in Set(clips.map(\.url)) { try? FileManager.default.removeItem(at: u) }
        clips = []
    }

    // MARK: Montage envoyé au serveur

    /// Sources (fichiers distincts, dans l'ordre d'apparition) et montage JSON.
    func montage() -> (sources: [URL], json: [String: Any]) {
        var sources: [URL] = []
        let clipsJSON: [[String: Any]] = clips.map { c in
            if !sources.contains(c.url) { sources.append(c.url) }
            return ["source": sources.firstIndex(of: c.url)!, "debut": arrondi(c.debut), "fin": arrondi(c.fin),
                    "muet": c.muet, "filtre": c.filtre]
        }
        let total = dureeTotale
        var json: [String: Any] = [
            "clips": clipsJSON,
            "filtre": "aucun",
            "textes": textes.map { t in
                ["texte": t.texte, "debut": arrondi(min(t.debut, total)), "fin": arrondi(min(t.fin, total)),
                 "position": t.position, "taille": t.taille, "fond": t.fond] as [String: Any]
            },
            "couverture": arrondi(min(couverture, max(0, total - 0.1))),
        ]
        if let m = musique {
            json["musique"] = ["cle": m.cle, "titre": m.titre, "debut": arrondi(m.debut),
                               "volume": m.volume, "voix": m.voix]
        } else {
            json["musique"] = NSNull()
        }
        return (sources, json)
    }

    private func arrondi(_ x: Double) -> Double { (x * 1000).rounded() / 1000 }

    // MARK: Aperçu de l'éditeur

    /*
     * Composition jouable du montage : les plages de chaque clip bout à
     * bout, sans le son des clips coupés, et le filtre de chaque clip
     * appliqué à la volée par Core Image (rien n'est écrit sur le disque).
     */
    func apercu() async -> AVPlayerItem? {
        let composition = AVMutableComposition()
        guard let pv = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
              let pa = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
        else { return nil }
        var curseur = CMTime.zero
        var plages: [(fin: Double, filtre: FiltreVideo)] = []
        for c in clips {
            let asset = AVURLAsset(url: c.url)
            let plage = CMTimeRange(start: CMTime(seconds: c.debut, preferredTimescale: 600),
                                    end: CMTime(seconds: c.fin, preferredTimescale: 600))
            guard let video = try? await asset.loadTracks(withMediaType: .video).first else { continue }
            try? pv.insertTimeRange(plage, of: video, at: curseur)
            if !c.muet, let audio = try? await asset.loadTracks(withMediaType: .audio).first {
                try? pa.insertTimeRange(plage, of: audio, at: curseur)
            } else {
                pa.insertEmptyTimeRange(CMTimeRange(start: curseur, duration: plage.duration))
            }
            curseur = curseur + plage.duration
            plages.append((curseur.seconds, FiltreVideo.de(c.filtre)))
        }
        guard curseur > .zero else { return nil }
        let item = AVPlayerItem(asset: composition)
        let filtres = plages
        item.videoComposition = AVVideoComposition(asset: composition) { requete in
            let t = requete.compositionTime.seconds
            let filtre = filtres.first { t < $0.fin }?.filtre ?? filtres.last!.filtre
            requete.finish(with: filtre.appliquer(requete.sourceImage), context: nil)
        }
        if let m = musique {
            let mix = AVMutableAudioMix()
            let p = AVMutableAudioMixInputParameters(track: pa)
            p.setVolume(Float(m.voix), at: .zero)
            mix.inputParameters = [p]
            item.audioMix = mix
        }
        return item
    }
}

// MARK: Publication

enum Publication {
    /*
     * Envoi multipart vers /api/videos (la route du site) : titre,
     * description, matière, montage JSON et les clips. Le corps est
     * écrit dans un fichier puis envoyé depuis le disque, avec la
     * progression : rien de lourd ne reste en mémoire.
     */
    static func envoyer(api: API, projet: (sources: [URL], json: [String: Any]), titre: String,
                        description: String, matiere: Int?, progression: @escaping @Sendable (Double) -> Void) async throws -> Int {
        let limite = "mp2-\(UUID().uuidString)"
        let corps = FileManager.default.temporaryDirectory.appending(path: "publication-\(UUID().uuidString)")
        FileManager.default.createFile(atPath: corps.path, contents: nil)
        defer { try? FileManager.default.removeItem(at: corps) }
        let h = try FileHandle(forWritingTo: corps)
        func ecrire(_ s: String) { h.write(Data(s.utf8)) }
        func champ(_ nom: String, _ valeur: String) {
            ecrire("--\(limite)\r\nContent-Disposition: form-data; name=\"\(nom)\"\r\n\r\n\(valeur)\r\n")
        }
        champ("titre", titre)
        champ("description", description)
        champ("matiere", matiere.map(String.init) ?? "")
        let json = try JSONSerialization.data(withJSONObject: projet.json)
        champ("montage", String(decoding: json, as: UTF8.self))
        for (i, url) in projet.sources.enumerated() {
            ecrire("--\(limite)\r\nContent-Disposition: form-data; name=\"clips\"; filename=\"clip\(i).mp4\"\r\n")
            ecrire("Content-Type: video/mp4\r\n\r\n")
            let lecteur = try FileHandle(forReadingFrom: url)
            while let bloc = try lecteur.read(upToCount: 1 << 20), !bloc.isEmpty { h.write(bloc) }
            try lecteur.close()
            ecrire("\r\n")
        }
        ecrire("--\(limite)--\r\n")
        try h.close()

        let taille = (try? FileManager.default.attributesOfItem(atPath: corps.path)[.size] as? Int) ?? 0
        if taille > 90 * 1024 * 1024 {
            throw ErreurAPI(message: "Vidéo trop lourde (90 Mo au plus) : raccourcis-la un peu.", statut: 413)
        }
        var req = URLRequest(url: API.base.appending(path: "api/videos"))
        req.httpMethod = "POST"
        req.timeoutInterval = 600
        req.setValue("multipart/form-data; boundary=\(limite)", forHTTPHeaderField: "Content-Type")
        if let jeton = api.jeton { req.setValue("Bearer \(jeton)", forHTTPHeaderField: "Authorization") }
        let (donnees, reponse): (Data, URLResponse)
        do {
            (donnees, reponse) = try await URLSession.shared.upload(for: req, fromFile: corps,
                                                                    delegate: Suivi(progression: progression))
        } catch { throw ErreurAPI.reseau }
        struct R: Decodable { let id: Int?; let erreur: String? }
        let r = try? JSONDecoder().decode(R.self, from: donnees)
        guard let http = reponse as? HTTPURLResponse, http.statusCode == 200, let id = r?.id else {
            throw ErreurAPI(message: r?.erreur ?? "Envoi refusé, réessaie.", statut: (reponse as? HTTPURLResponse)?.statusCode ?? 0)
        }
        return id
    }

    private final class Suivi: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
        let progression: @Sendable (Double) -> Void
        init(progression: @escaping @Sendable (Double) -> Void) { self.progression = progression }
        func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData envoye: Int64,
                        totalBytesSent total: Int64, totalBytesExpectedToSend attendu: Int64) {
            guard attendu > 0 else { return }
            progression(Double(total) / Double(attendu))
        }
    }
}
