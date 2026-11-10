import AVFoundation
import Observation
import UIKit

/*
 * Trois lecteurs pour tout le fil, recyclés : la vidéo i utilise le
 * lecteur i mod 3. La précédente, la courante et la suivante sont donc
 * toujours chargées et prêtes ; seules elles occupent de la mémoire.
 * Les vidéos sont lues en streaming (plages d'octets) avec le jeton.
 */
@MainActor @Observable
final class Lecteurs {
    private(set) var joueurs: [AVPlayer] = (0..<3).map { _ in
        let p = AVPlayer()
        p.actionAtItemEnd = .none
        p.automaticallyWaitsToMinimizeStalling = true
        return p
    }
    private var chargees: [Int?] = [nil, nil, nil]     // id de vidéo par lecteur
    private var finDeLecture: [NSObjectProtocol] = []
    private(set) var active: Int?                        // id de la vidéo qui joue
    var enPause = false

    func joueur(pour index: Int) -> AVPlayer { joueurs[index % 3] }

    /// Prépare la fenêtre autour de `index` et lance la vidéo courante.
    func preparer(_ videos: [Video], index: Int, jeton: String?) {
        guard videos.indices.contains(index) else { return }
        for i in max(0, index - 1)...min(videos.count - 1, index + 1) {
            let slot = i % 3, v = videos[i]
            if chargees[slot] != v.id {
                chargees[slot] = v.id
                joueurs[slot].replaceCurrentItem(with: Self.element(v, jeton: jeton))
            }
        }
        active = videos[index].id
        enPause = false
        for (slot, p) in joueurs.enumerated() {
            if slot == index % 3 {
                p.play()
            } else {
                p.pause()
                p.seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero)
            }
        }
        boucler()
    }

    func basculerPause() {
        guard let p = joueurActif else { return }
        enPause.toggle()
        enPause ? p.pause() : p.play()
    }

    func toutArreter() { joueurs.forEach { $0.pause() } }

    func reprendre() { if !enPause { joueurActif?.play() } }

    var joueurActif: AVPlayer? {
        guard let active, let slot = chargees.firstIndex(of: active) else { return nil }
        return joueurs[slot]
    }

    func lecteurCharge(pour id: Int) -> AVPlayer? {
        chargees.firstIndex(of: id).map { joueurs[$0] }
    }

    /// Chaque vidéo tourne en boucle, comme sur un réseau social.
    private func boucler() {
        finDeLecture.forEach(NotificationCenter.default.removeObserver)
        finDeLecture = joueurs.compactMap { p in
            guard let item = p.currentItem else { return nil }
            return NotificationCenter.default.addObserver(forName: AVPlayerItem.didPlayToEndTimeNotification,
                                                          object: item, queue: .main) { [weak p] _ in
                p?.seek(to: .zero)
                p?.play()
            }
        }
    }

    private static func element(_ v: Video, jeton: String?) -> AVPlayerItem {
        let url = API.base.appending(path: "api/videos/\(v.id)")
        var options: [String: Any] = [AVURLAssetPreferPreciseDurationAndTimingKey: false]
        if let jeton { options["AVURLAssetHTTPHeaderFieldsKey"] = ["Authorization": "Bearer \(jeton)"] }
        let item = AVPlayerItem(asset: AVURLAsset(url: url, options: options))
        item.preferredForwardBufferDuration = 4
        return item
    }

    static func activerSon() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try? AVAudioSession.sharedInstance().setActive(true)
    }
}

/// Couche vidéo : remplit l'écran en portrait, entière (sur sa couverture floutée) en paysage.
final class VueLecteur: UIView {
    override static var layerClass: AnyClass { AVPlayerLayer.self }
    var couche: AVPlayerLayer { layer as! AVPlayerLayer }
    var surPrete: ((Bool) -> Void)?
    var surFormat: ((Bool) -> Void)?
    private var observations: [NSKeyValueObservation] = []

    var joueur: AVPlayer? {
        didSet {
            guard joueur !== oldValue else { return }
            couche.player = joueur
            observations = [
                couche.observe(\.isReadyForDisplay, options: [.initial, .new]) { [weak self] c, _ in
                    let pret = c.isReadyForDisplay
                    DispatchQueue.main.async { self?.surPrete?(pret) }
                },
                couche.observe(\.videoRect, options: [.new]) { [weak self] c, _ in
                    guard let item = c.player?.currentItem else { return }
                    let s = item.presentationSize
                    guard s.width > 0 else { return }
                    let portrait = s.height >= s.width
                    DispatchQueue.main.async {
                        self?.couche.videoGravity = portrait ? .resizeAspectFill : .resizeAspect
                        self?.surFormat?(portrait)
                    }
                },
            ]
        }
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        couche.videoGravity = .resizeAspectFill
        backgroundColor = .clear
    }

    required init?(coder: NSCoder) { fatalError() }
}
