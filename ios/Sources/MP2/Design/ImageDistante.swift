import SwiftUI
import UIKit

/*
 * Image servie derrière la session (couvertures de vidéos) : AsyncImage
 * ne sait pas ajouter le jeton. Cache mémoire partagé, décodage hors du
 * fil principal, fondu à l'arrivée.
 */
actor CacheImages {
    static let partage = CacheImages()
    private let memoire = NSCache<NSURL, UIImage>()
    private var enCours: [URL: Task<UIImage?, Never>] = [:]

    init() { memoire.totalCostLimit = 60 * 1024 * 1024 }

    func image(_ url: URL, jeton: String?) async -> UIImage? {
        if let i = memoire.object(forKey: url as NSURL) { return i }
        if let t = enCours[url] { return await t.value }
        let t = Task<UIImage?, Never> {
            var req = URLRequest(url: url)
            if let jeton { req.setValue("Bearer \(jeton)", forHTTPHeaderField: "Authorization") }
            guard let (donnees, rep) = try? await URLSession.shared.data(for: req),
                  (rep as? HTTPURLResponse)?.statusCode == 200,
                  let image = UIImage(data: donnees) else { return nil }
            return await image.byPreparingForDisplay() ?? image
        }
        enCours[url] = t
        let image = await t.value
        enCours[url] = nil
        if let image { memoire.setObject(image, forKey: url as NSURL, cost: Int(image.size.width * image.size.height * 4)) }
        return image
    }
}

struct ImageDistante: View {
    let url: URL
    var remplir = true
    @Environment(Session.self) private var session
    @State private var image: UIImage?

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: remplir ? .fill : .fit)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: image != nil)
        .task(id: url) { image = await CacheImages.partage.image(url, jeton: session.api.jeton) }
    }
}
