import CoreImage

/*
 * Les treize filtres du studio, copie exacte de FILTRES
 * (src/lib/videos-montage.ts) : mêmes clés, mêmes fonctions CSS. L'app
 * ne s'en sert que pour l'aperçu ; le filtre voyage dans le montage et
 * le rendu ffmpeg du serveur l'applique (matrices dérivées des mêmes
 * fonctions). Les calculs se font sur les valeurs sRGB, comme en CSS.
 */
struct FiltreVideo: Identifiable, Hashable, Sendable {
    enum Fonction: Hashable, Sendable {
        case sepia(Double), grayscale(Double), saturate(Double), brightness(Double)
        case contrast(Double), hueRotate(Double), invert(Double)
    }

    let cle: String
    let libelle: String
    let fonctions: [Fonction]
    var vignette = false
    var id: String { cle }

    static let tous: [FiltreVideo] = [
        .init(cle: "aucun", libelle: "Normal", fonctions: []),
        .init(cle: "vif", libelle: "Vif", fonctions: [.saturate(1.45), .contrast(1.08)]),
        .init(cle: "chaud", libelle: "Chaud", fonctions: [.sepia(0.3), .saturate(1.25)]),
        .init(cle: "lumineux", libelle: "Lumineux", fonctions: [.brightness(1.15), .contrast(1.05)]),
        .init(cle: "vintage", libelle: "Vintage", fonctions: [.sepia(0.45), .contrast(0.92), .brightness(1.06), .saturate(0.9)], vignette: true),
        .init(cle: "cine", libelle: "Ciné", fonctions: [.contrast(1.25), .saturate(0.8), .brightness(0.95)], vignette: true),
        .init(cle: "pop", libelle: "Pop", fonctions: [.saturate(1.9), .contrast(1.15), .hueRotate(-8)]),
        .init(cle: "reve", libelle: "Rêve", fonctions: [.brightness(1.1), .saturate(1.35), .contrast(0.9), .hueRotate(-15)]),
        .init(cle: "nuit", libelle: "Bleu nuit", fonctions: [.grayscale(1), .sepia(1), .hueRotate(180), .saturate(1.6), .brightness(0.95)]),
        .init(cle: "matrix", libelle: "Matrix", fonctions: [.grayscale(1), .sepia(1), .hueRotate(65), .saturate(2), .contrast(1.1)]),
        .init(cle: "nb", libelle: "N&B", fonctions: [.grayscale(1), .contrast(1.1)]),
        .init(cle: "tableau", libelle: "Tableau", fonctions: [.grayscale(1), .contrast(1.6), .brightness(1.1)]),
        .init(cle: "negatif", libelle: "Négatif", fonctions: [.invert(1)]),
    ]

    static func de(_ cle: String) -> FiltreVideo { tous.first { $0.cle == cle } ?? tous[0] }

    /// Applique les fonctions dans l'ordre, chaque résultat ramené dans [0, 1] comme en CSS.
    func appliquer(_ source: CIImage) -> CIImage {
        guard !fonctions.isEmpty || vignette else { return source }
        var image = source
        for f in fonctions {
            let (m, biais) = Self.matrice(f)
            image = image
                .applyingFilter("CIColorMatrix", parameters: [
                    "inputRVector": CIVector(x: m[0], y: m[1], z: m[2], w: 0),
                    "inputGVector": CIVector(x: m[3], y: m[4], z: m[5], w: 0),
                    "inputBVector": CIVector(x: m[6], y: m[7], z: m[8], w: 0),
                    "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 1),
                    "inputBiasVector": CIVector(x: biais, y: biais, z: biais, w: 0),
                ])
                .applyingFilter("CIColorClamp")
        }
        if vignette {
            // Aperçu proche du `vignette` de ffmpeg (le rendu final, lui, est exact).
            image = image.applyingFilter("CIVignette", parameters: [kCIInputIntensityKey: 0.9, kCIInputRadiusKey: 1.8])
        }
        return image.cropped(to: source.extent)
    }

    /// Matrice 3×3 (lignes R, G, B) et décalage, d'après la spécification CSS Filter Effects.
    private static func matrice(_ f: Fonction) -> ([CGFloat], CGFloat) {
        switch f {
        case .grayscale(let a):
            let b = 1 - a
            return ([0.2126 + 0.7874 * b, 0.7152 - 0.7152 * b, 0.0722 - 0.0722 * b,
                     0.2126 - 0.2126 * b, 0.7152 + 0.2848 * b, 0.0722 - 0.0722 * b,
                     0.2126 - 0.2126 * b, 0.7152 - 0.7152 * b, 0.0722 + 0.9278 * b].map { CGFloat($0) }, 0)
        case .sepia(let a):
            let b = 1 - a
            return ([0.393 + 0.607 * b, 0.769 - 0.769 * b, 0.189 - 0.189 * b,
                     0.349 - 0.349 * b, 0.686 + 0.314 * b, 0.168 - 0.168 * b,
                     0.272 - 0.272 * b, 0.534 - 0.534 * b, 0.131 + 0.869 * b].map { CGFloat($0) }, 0)
        case .saturate(let a):
            return ([0.213 + 0.787 * a, 0.715 - 0.715 * a, 0.072 - 0.072 * a,
                     0.213 - 0.213 * a, 0.715 + 0.285 * a, 0.072 - 0.072 * a,
                     0.213 - 0.213 * a, 0.715 - 0.715 * a, 0.072 + 0.928 * a].map { CGFloat($0) }, 0)
        case .brightness(let a):
            return ([a, 0, 0, 0, a, 0, 0, 0, a].map { CGFloat($0) }, 0)
        case .hueRotate(let deg):
            let r = deg * .pi / 180, c = cos(r), s = sin(r)
            return ([0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
                     0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
                     0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072]
                .map { CGFloat($0) }, 0)
        case .contrast(let c):
            // (x − 0,5)·c + 0,5
            return ([c, 0, 0, 0, c, 0, 0, 0, c].map { CGFloat($0) }, CGFloat(0.5 - 0.5 * c))
        case .invert(let a):
            // x·(1 − 2a) + a
            let p = 1 - 2 * a
            return ([p, 0, 0, 0, p, 0, 0, 0, p].map { CGFloat($0) }, CGFloat(a))
        }
    }
}
