import CoreImage
import UIKit
import Vision

/*
 * Lentilles du studio : effets sur le visage, suivis par Vision et
 * dessinés dans l'image avant l'écriture du clip (l'effet est dans la
 * vidéo, comme sur le site). Mêmes lentilles et mêmes textes que
 * src/components/videos/lentilles/catalogue.ts ; on déclenche d'une
 * expression (bouche ouverte, sourcils haussés) ou d'un toucher.
 * Tout ici tourne sur la file de la caméra.
 */

/// Mesures du visage, en pixels de l'image (origine en bas à gauche, comme Core Image).
struct Visage {
    let boite: CGRect
    let oeilG: CGPoint
    let oeilD: CGPoint
    let nez: CGPoint
    /// 0 bouche fermée → 1 grande ouverte.
    let bouche: Double
    /// Écart sourcils-yeux rapporté à la hauteur du visage (comparé à une base mobile).
    let sourcils: Double

    var yeux: CGPoint { CGPoint(x: (oeilG.x + oeilD.x) / 2, y: (oeilG.y + oeilD.y) / 2) }
    var sommet: CGPoint { CGPoint(x: boite.midX, y: boite.maxY) }
    var largeur: CGFloat { boite.width }
}

/// Détection d'une montée au-dessus d'un seuil (avec temps de repos), comme `front` du site.
struct Front {
    private var haut = false
    private var repos = 0.0
    mutating func monte(_ valeur: Double, seuil: Double, t: Double, pause: Double) -> Bool {
        defer { haut = valeur > seuil * 0.8 }
        guard valeur > seuil, !haut, t >= repos else { return false }
        repos = t + pause
        return true
    }
}

class Lentille {
    class var cle: String { "" }
    class var nom: String { "" }
    class var icone: String { "" }
    class var aide: String { "" }
    required init() {}
    /// Image traitée ; `toucher` vaut vrai une seule image après un toucher de l'aperçu.
    func appliquer(_ image: CIImage, visage: Visage?, t: Double, dt: Double, toucher: Bool) -> CIImage { image }

    static let toutes: [Lentille.Type] = [Zoom.self, Sourcils.self, Laser.self, Randomiseur.self, Pensees.self, PNJ.self]
}

// MARK: Outils de dessin

enum Dessin {
    /// Surcouche transparente dessinée avec UIKit (origine en haut à gauche), rendue en CIImage.
    static func surcouche(_ taille: CGSize, _ dessiner: (CGContext) -> Void) -> CIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let image = UIGraphicsImageRenderer(size: taille, format: format).image { dessiner($0.cgContext) }
        return image.cgImage.map { CIImage(cgImage: $0) } ?? CIImage.empty()
    }

    /// Point Core Image (bas-gauche) → point UIKit (haut-gauche).
    static func ui(_ p: CGPoint, _ h: CGFloat) -> CGPoint { CGPoint(x: p.x, y: h - p.y) }

    /// Agrandit l'image autour de `centre` (coordonnées de l'image) et la recadre à sa taille.
    static func zoomer(_ image: CIImage, centre: CGPoint, k: CGFloat, dx: CGFloat = 0, dy: CGFloat = 0) -> CIImage {
        let e = image.extent
        let t = CGAffineTransform(translationX: e.midX + dx, y: e.midY + dy)
            .scaledBy(x: k, y: k)
            .translatedBy(x: -centre.x, y: -centre.y)
        return image.clampedToExtent().transformed(by: t).cropped(to: e)
    }

    static func vignette(_ image: CIImage, intensite: Double) -> CIImage {
        image.applyingFilter("CIVignette", parameters: [kCIInputIntensityKey: intensite, kCIInputRadiusKey: 1.4])
    }

    /// Texte façon mème : blanc, contour noir, centré sur `x`, haut du bloc en `y` (UIKit).
    static func texteMeme(_ texte: String, x: CGFloat, y: CGFloat, taille: CGFloat, largeur: CGFloat, fond: UIColor? = nil) {
        let style = NSMutableParagraphStyle()
        style.alignment = .center
        let attributs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: taille, weight: .heavy),
            .foregroundColor: UIColor.white,
            .strokeColor: UIColor.black,
            .strokeWidth: fond == nil ? -4 : 0,
            .paragraphStyle: style,
        ]
        let chaine = NSAttributedString(string: texte, attributes: attributs)
        let cadre = chaine.boundingRect(with: CGSize(width: largeur, height: .greatestFiniteMagnitude),
                                        options: [.usesLineFragmentOrigin], context: nil)
        let rect = CGRect(x: x - largeur / 2, y: y, width: largeur, height: ceil(cadre.height))
        if let fond {
            let boite = CGRect(x: x - cadre.width / 2 - taille * 0.5, y: y - taille * 0.3,
                               width: cadre.width + taille, height: cadre.height + taille * 0.6)
            fond.setFill()
            UIBezierPath(roundedRect: boite, cornerRadius: taille * 0.4).fill()
        }
        chaine.draw(with: rect, options: [.usesLineFragmentOrigin], context: nil)
    }

    static func lisser(_ valeur: Double, vers cible: Double, dt: Double, vitesse: Double) -> Double {
        valeur + (cible - valeur) * (1 - exp(-vitesse * dt))
    }

    /// Un élément différent du précédent.
    static func autre<T: Equatable>(_ liste: [T], _ avant: T?) -> T {
        let choix = liste.filter { $0 != avant }
        return (choix.isEmpty ? liste : choix).randomElement()!
    }

    /// Texte tapé à la machine : les `vitesse` premiers caractères par seconde.
    static func tape(_ texte: String, depuis: Double, vitesse: Double = 30) -> String {
        String(texte.prefix(max(0, Int(depuis * vitesse))))
    }
}

// MARK: 1. Zoom dramatique

final class Zoom: Lentille {
    override class var cle: String { "zoom" }
    override class var nom: String { "Zoom dramatique" }
    override class var icone: String { "😱" }
    override class var aide: String { "Ouvre grand la bouche (ou touche) : zoom de tragédie." }
    private var k = 1.0
    private var jusqua = 0.0
    private var front = Front()

    override func appliquer(_ image: CIImage, visage: Visage?, t: Double, dt: Double, toucher: Bool) -> CIImage {
        if let v = visage, front.monte(v.bouche, seuil: 0.45, t: t, pause: 2.8) { jusqua = t + 2.6 }
        if toucher && t > jusqua { jusqua = t + 2.6 }
        let actif = t < jusqua
        k = Dessin.lisser(k, vers: actif ? (t > jusqua - 2.0 ? 2.3 : 1.6) : 1, dt: dt, vitesse: actif ? 14 : 5)
        guard k > 1.01, let v = visage else { return image }
        let W = image.extent.width, H = image.extent.height
        let secousse = actif ? CGFloat.random(in: -0.005...0.005) * W : 0
        var sortie = Dessin.zoomer(image, centre: v.yeux, k: k, dx: secousse)
        guard actif else { return sortie }
        sortie = sortie.applyingFilter("CIColorControls", parameters: [kCIInputContrastKey: 1.25, kCIInputSaturationKey: 1.2])
        sortie = Dessin.vignette(sortie, intensite: 1.2)
        // Lignes de vitesse façon manga.
        let lignes = Dessin.surcouche(CGSize(width: W, height: H)) { c in
            c.setStrokeColor(UIColor.white.withAlphaComponent(0.35).cgColor)
            c.setLineWidth(W * 0.004)
            let d = hypot(W, H)
            for i in 0..<36 {
                let a = Double(i) / 36 * 2 * .pi + t * 0.3
                let r0 = d * CGFloat(0.38 + Double.random(in: 0...0.06)), r1 = d * 0.7
                c.move(to: CGPoint(x: W / 2 + cos(a) * r0, y: H / 2 + sin(a) * r0))
                c.addLine(to: CGPoint(x: W / 2 + cos(a) * r1, y: H / 2 + sin(a) * r1))
            }
            c.strokePath()
        }
        return lignes.composited(over: sortie)
    }
}

// MARK: 2. Sourcils suspects

final class Sourcils: Lentille {
    override class var cle: String { "boom" }
    override class var nom: String { "Sourcils suspects" }
    override class var icone: String { "🤨" }
    override class var aide: String { "Hausse les sourcils : BOOM, zoom et légende." }
    private static let legendes = ["Suspect.", "Hmm.", "Intéressant…", "Pardon ?", "Tu as dit « facile » ?", "Le DM, tu l'as fait ?"]
    private var jusqua = 0.0
    private var legende: String?
    private var front = Front()

    override func appliquer(_ image: CIImage, visage: Visage?, t: Double, dt: Double, toucher: Bool) -> CIImage {
        if (visage.map { front.monte($0.sourcils, seuil: 0.5, t: t, pause: 1.6) } ?? false) || (toucher && t > jusqua) {
            jusqua = t + 1.3
            legende = Dessin.autre(Self.legendes, legende)
        }
        guard t < jusqua, let v = visage else { return image }
        let W = image.extent.width, H = image.extent.height
        let p = 1 - (jusqua - t) / 1.3
        let k = 1.9 - min(0.5, p * 0.6)
        let sec = CGFloat(max(0, 1 - p * 3)) * W * 0.03
        var sortie = Dessin.zoomer(image, centre: CGPoint(x: v.yeux.x, y: v.yeux.y + v.largeur * 0.1), k: k,
                                   dx: .random(in: -0.5...0.5) * sec, dy: .random(in: -0.5...0.5) * sec)
        sortie = sortie.applyingFilter("CIColorControls", parameters: [kCIInputContrastKey: 1.5, kCIInputSaturationKey: 2.2])
        sortie = Dessin.vignette(sortie, intensite: 1)
        let flash = p < 0.12
        let texte = legende ?? ""
        return Dessin.surcouche(CGSize(width: W, height: H)) { c in
            if flash { c.setFillColor(UIColor.white.withAlphaComponent(0.55).cgColor); c.fill(CGRect(x: 0, y: 0, width: W, height: H)) }
            Dessin.texteMeme(texte, x: W / 2, y: H * 0.74, taille: W * 0.085, largeur: W * 0.86)
        }.composited(over: sortie)
    }
}

// MARK: 3. Yeux laser

final class Laser: Lentille {
    override class var cle: String { "laser" }
    override class var nom: String { "Yeux laser" }
    override class var icone: String { "🔴" }
    override class var aide: String { "Ouvre la bouche pour tirer. Le mode « je vais tout valider »." }
    private var force = 0.0

    override func appliquer(_ image: CIImage, visage: Visage?, t: Double, dt: Double, toucher: Bool) -> CIImage {
        guard let v = visage else { return image }
        let tir = v.bouche > 0.35 || toucher
        force = Dessin.lisser(force, vers: tir ? 1 : 0, dt: dt, vitesse: tir ? 12 : 6)
        var sortie = image
        if force > 0.05 {
            // « Deep fried » pendant le tir.
            let cramee = image.applyingFilter("CIColorControls", parameters: [
                kCIInputSaturationKey: 3, kCIInputContrastKey: 1.7, kCIInputBrightnessKey: 0.05])
            sortie = cramee.applyingFilter("CIBlendWithAlphaMask", parameters: [
                kCIInputBackgroundImageKey: image,
                kCIInputMaskImageKey: CIImage(color: CIColor(red: 1, green: 1, blue: 1, alpha: force)).cropped(to: image.extent),
            ])
        }
        let W = image.extent.width, H = image.extent.height
        let f = CGFloat(force)
        let dir = CGPoint(x: (v.nez.x - v.yeux.x) * 3, y: (v.nez.y - v.yeux.y) * 0.8 - v.largeur * 0.25)
        let n = max(1, hypot(dir.x, dir.y))
        let L = hypot(W, H) * 1.2
        let couche = Dessin.surcouche(CGSize(width: W, height: H)) { c in
            c.setBlendMode(.plusLighter)
            for o0 in [v.oeilG, v.oeilD] {
                let o = Dessin.ui(o0, H)
                let r = v.largeur * (0.07 + 0.08 * f)
                let couleurs = [UIColor.white.cgColor, UIColor(red: 1, green: 0.16, blue: 0.16, alpha: 0.95).cgColor,
                                UIColor(red: 1, green: 0, blue: 0, alpha: 0).cgColor] as CFArray
                if let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: couleurs, locations: [0, 0.25, 1]) {
                    c.drawRadialGradient(g, startCenter: o, startRadius: 0, endCenter: o, endRadius: r * 2.4, options: [])
                }
                c.setStrokeColor(UIColor(red: 1, green: 0.47, blue: 0.47, alpha: 0.8).cgColor)
                c.setLineWidth(max(2, v.largeur * 0.008))
                for k in 0..<4 {
                    let a = Double(k) * .pi / 4 + t * 2, l = r * (3.5 + f * 4)
                    c.move(to: CGPoint(x: o.x - cos(a) * l, y: o.y - sin(a) * l))
                    c.addLine(to: CGPoint(x: o.x + cos(a) * l, y: o.y + sin(a) * l))
                }
                c.strokePath()
                guard f > 0.1 else { continue }
                let fin = Dessin.ui(CGPoint(x: o0.x + dir.x / n * L, y: o0.y + dir.y / n * L), H)
                c.setLineCap(.round)
                for (largeur, couleur) in [(v.largeur * 0.12 * f, UIColor(red: 1, green: 0, blue: 0, alpha: 0.35)),
                                           (v.largeur * 0.05 * f, UIColor(red: 1, green: 0.24, blue: 0.24, alpha: 0.8)),
                                           (v.largeur * 0.016 * f, UIColor.white)] {
                    c.setStrokeColor(couleur.cgColor)
                    c.setLineWidth(largeur)
                    c.move(to: o)
                    c.addLine(to: fin)
                    c.strokePath()
                }
            }
        }
        return couche.composited(over: sortie)
    }
}

// MARK: 4. Randomiseur prépa

final class Randomiseur: Lentille {
    override class var cle: String { "random" }
    override class var nom: String { "Randomiseur prépa" }
    override class var icone: String { "🎰" }
    override class var aide: String { "Touche l’écran ou ouvre la bouche : le destin choisit pour toi." }
    private static let questions: [(q: String, r: [String])] = [
        ("Ton école dans deux ans", ["L'X (dans tes rêves)", "Centrale, en 5/2", "Une école à Douai", "L3 de philo", "Reconversion : boulangerie", "Une start-up crypto", "L'ENS (de la vie)", "Encore en prépa"]),
        ("Ta note au prochain DS", ["4,5 (et c'est bien)", "−2, record historique", "20 (t'as copié)", "Copie blanche artistique", "7, « des idées »", "Hors barème"]),
        ("Ce que pense ton colleur", ["« C'est trivial. »", "« Vous êtes sûr ? »", "« On va s'arrêter là. »", "« C'est du cours. »", "« Effacez tout. »", "« Bon courage. »"]),
        ("Ton heure de coucher ce soir", ["23 h (menteur)", "3 h 12", "Jamais", "Pendant la colle", "Demain 6 h, debout 6 h 05"]),
        ("Ton moral après le DM", ["Forme indéterminée 0/0", "Tend vers 0", "Non mesurable", "Négatif mais borné", "Divergent"]),
        ("Ta vraie passion", ["Le café", "Dire « ouais ouais »", "Recopier le corrigé", "Le colloscope", "Dormir en amphi", "Les pauses de 10 min qui durent 1 h"]),
    ]
    private var question: Int?
    private var debut = 0.0, fin = 0.0, prochain = 0.0
    private var affiche = ""
    private var front = Front()

    override func appliquer(_ image: CIImage, visage: Visage?, t: Double, dt: Double, toucher: Bool) -> CIImage {
        let relance = toucher || (visage.map { front.monte($0.bouche, seuil: 0.45, t: t, pause: 1) } ?? false)
        if question == nil || (relance && t > fin + 0.6) {
            question = Dessin.autre(Array(Self.questions.indices), question)
            debut = t; fin = t + 3.2; prochain = 0
        }
        guard let qi = question else { return image }
        let q = Self.questions[qi]
        let tourne = t < fin
        if tourne && t >= prochain {
            affiche = Dessin.autre(q.r, affiche)
            let p = (t - debut) / (fin - debut)
            prochain = t + 0.05 + p * p * 0.35      // ralentit vers la fin, comme une roue
        }
        let W = image.extent.width, H = image.extent.height
        let T = W * 0.048
        let tete = visage.map { Dessin.ui($0.sommet, H) } ?? CGPoint(x: W / 2, y: H * 0.25)
        let y = max(H * 0.2, tete.y - T * 2.2)
        let texte = affiche
        return Dessin.surcouche(CGSize(width: W, height: H)) { _ in
            Dessin.texteMeme(q.q, x: W / 2, y: H * 0.08, taille: W * 0.06, largeur: W * 0.86)
            Dessin.texteMeme(texte, x: tete.x, y: y, taille: T, largeur: W * 0.86,
                             fond: tourne ? UIColor(white: 0.08, alpha: 0.85) : UIColor(red: 0.996, green: 0.17, blue: 0.33, alpha: 1))
        }.composited(over: image)
    }
}

// MARK: 5. Pensées intrusives

final class Pensees: Lentille {
    override class var cle: String { "pensees" }
    override class var nom: String { "Pensées intrusives" }
    override class var icone: String { "💭" }
    override class var aide: String { "Tes vraies pensées au-dessus de ta tête. Touche pour la suivante." }
    private static let pensees = [
        "Et si je devenais influenceur ?",
        "Le prof a dit « évident » il y a 20 min. Toujours pas évident.",
        "Quatre cafés, ça compte comme un repas ?",
        "Mes parents pensent que je travaille, là.",
        "Si je ferme les yeux 5 min, ça compte comme une nuit ?",
        "Le DM est pour demain. Le demain d'avant-hier.",
        "Je hoche la tête depuis une heure. Je n'ai rien compris.",
        "Peut-être que le droit, c'était pas si mal.",
        "Mon cerveau a quitté le groupe.",
        "Ma seule relation stable : le colloscope.",
        "J'ai dit « oui c'est clair » par pur réflexe.",
        "Je pourrais tout plaquer et élever des chèvres.",
        "Pourquoi j'ai levé la main ?",
        "Ce soir je dors tôt. (Non.)",
    ]
    private var texte: String?
    private var depuis = 0.0

    override func appliquer(_ image: CIImage, visage: Visage?, t: Double, dt: Double, toucher: Bool) -> CIImage {
        if texte == nil || toucher || t - depuis > 4.5 { texte = Dessin.autre(Self.pensees, texte); depuis = t }
        guard let v = visage, let texte else { return image }
        let W = image.extent.width, H = image.extent.height
        let tete = Dessin.ui(v.sommet, H)
        let T = W * 0.045
        let x = max(W * 0.4, min(W * 0.6, tete.x + v.largeur * 0.15))
        let tape = Dessin.tape(texte, depuis: t - depuis)
        return Dessin.surcouche(CGSize(width: W, height: H)) { c in
            let largeur = W * 0.62
            let haut = max(H * 0.06, tete.y - T * 5.5)
            let bulle = CGRect(x: x - largeur / 2, y: haut, width: largeur, height: T * 4.2)
            c.setFillColor(UIColor.white.withAlphaComponent(0.95).cgColor)
            c.addPath(UIBezierPath(roundedRect: bulle, cornerRadius: T * 1.6).cgPath)
            c.fillPath()
            for (i, r) in [T * 0.5, T * 0.32].enumerated() {   // petites bulles vers la tête
                let p = CGPoint(x: (x + tete.x) / 2 + CGFloat(i) * (tete.x - x) / 3, y: bulle.maxY + T * 0.6 + CGFloat(i) * T * 0.9)
                c.fillEllipse(in: CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2))
            }
            let style = NSMutableParagraphStyle(); style.alignment = .center
            NSAttributedString(string: tape.isEmpty ? " " : tape, attributes: [
                .font: UIFont.systemFont(ofSize: T, weight: .semibold), .foregroundColor: UIColor.black, .paragraphStyle: style,
            ]).draw(in: bulle.insetBy(dx: T * 0.8, dy: T * 0.6))
        }.composited(over: image)
    }
}

// MARK: 6. PNJ

final class PNJ: Lentille {
    override class var cle: String { "pnj" }
    override class var nom: String { "PNJ" }
    override class var icone: String { "🎮" }
    override class var aide: String { "Tu deviens un PNJ de jeu vidéo. Ouvre la bouche ou touche pour la réplique suivante." }
    private static let repliques = [
        "Bonjour, aventurier. Tu cherches la salle de colle ? Moi aussi. Depuis septembre.",
        "Je peux te vendre un DM corrigé. Trois cafés. Pas de remboursement.",
        "Quête disponible : « Comprendre l'électrocinétique ». Récompense : aucune.",
        "Au nord, il y a un DS. Beaucoup y sont allés. Peu sont revenus.",
        "Mon moral se régénère uniquement pendant les vacances.",
        "Tu as fait le DM ? Moi non plus. On est alliés maintenant.",
        "Je dis toujours la même phrase. C'est ça, la prépa.",
    ]
    private var i = Int.random(in: 0..<PNJ.repliques.count)
    private var depuis = 0.0
    private var moral = 100.0
    private var parle = Front()

    override func appliquer(_ image: CIImage, visage: Visage?, t: Double, dt: Double, toucher: Bool) -> CIImage {
        let ligne = Self.repliques[i]
        let bouche = visage.map { parle.monte($0.bouche, seuil: 0.35, t: t, pause: 1.5) } ?? false
        if toucher || (bouche && t - depuis > Double(ligne.count) / 30) {
            i = (i + 1) % Self.repliques.count; depuis = t
            moral = max(3, moral - 17)
        }
        let W = image.extent.width, H = image.extent.height
        let teint = image.applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 0.7, kCIInputContrastKey: 1.15])
        let T = W * 0.04
        let texte = Dessin.tape(Self.repliques[i], depuis: t - depuis)
        let m = moral
        return Dessin.surcouche(CGSize(width: W, height: H)) { c in
            // Boîte de dialogue en bas, nom et jauge de moral.
            let boite = CGRect(x: W * 0.05, y: H * 0.7, width: W * 0.9, height: T * 6)
            c.setFillColor(UIColor(red: 0.05, green: 0.06, blue: 0.16, alpha: 0.9).cgColor)
            c.addPath(UIBezierPath(roundedRect: boite, cornerRadius: T * 0.5).cgPath)
            c.fillPath()
            c.setStrokeColor(UIColor.white.cgColor)
            c.setLineWidth(T * 0.15)
            c.addPath(UIBezierPath(roundedRect: boite.insetBy(dx: T * 0.2, dy: T * 0.2), cornerRadius: T * 0.4).cgPath)
            c.strokePath()
            NSAttributedString(string: "PNJ de la prépa", attributes: [
                .font: UIFont.monospacedSystemFont(ofSize: T * 0.9, weight: .bold), .foregroundColor: UIColor.systemYellow,
            ]).draw(at: CGPoint(x: boite.minX + T * 0.8, y: boite.minY - T * 1.4))
            NSAttributedString(string: texte, attributes: [
                .font: UIFont.monospacedSystemFont(ofSize: T, weight: .semibold), .foregroundColor: UIColor.white,
            ]).draw(in: boite.insetBy(dx: T * 0.8, dy: T * 0.7))
            let jauge = CGRect(x: W * 0.05, y: H * 0.06, width: W * 0.4, height: T * 0.8)
            c.setFillColor(UIColor.black.withAlphaComponent(0.6).cgColor); c.fill(jauge)
            c.setFillColor((m > 30 ? UIColor.systemGreen : UIColor.systemRed).cgColor)
            c.fill(CGRect(x: jauge.minX, y: jauge.minY, width: jauge.width * m / 100, height: jauge.height))
            NSAttributedString(string: "MORAL \(Int(m))", attributes: [
                .font: UIFont.monospacedSystemFont(ofSize: T * 0.7, weight: .bold), .foregroundColor: UIColor.white,
            ]).draw(at: CGPoint(x: jauge.minX, y: jauge.maxY + T * 0.2))
        }.composited(over: teint)
    }
}

// MARK: Suivi du visage et moteur

/// Lentille active et suivi du visage, partagés entre l'interface et la file de la caméra.
final class MoteurLentilles: @unchecked Sendable {
    private let verrou = NSLock()
    private var active: Lentille?
    private var toucher = false
    private var precedent: Double?
    private var baseSourcils: Double?
    private let suivi = VNSequenceRequestHandler()

    /// Interface : change de lentille (nil : aucune). Chaque choix repart d'un état neuf.
    func choisir(_ type: Lentille.Type?) {
        verrou.lock(); active = type.map { $0.init() }; precedent = nil; verrou.unlock()
    }

    /// Interface : un toucher sur l'aperçu, transmis à la prochaine image.
    func toucherEcran() { verrou.lock(); toucher = true; verrou.unlock() }

    var estActive: Bool { verrou.lock(); defer { verrou.unlock() }; return active != nil }

    /// File de la caméra : image traitée, ou nil sans lentille (l'image brute sert alors telle quelle).
    func traiter(_ image: CIImage, tampon: CVPixelBuffer, instant: CMTime) -> CIImage? {
        verrou.lock()
        let lentille = active, touche = toucher
        toucher = false
        verrou.unlock()
        guard let lentille else { return nil }
        let t = instant.seconds
        let dt = min(0.1, max(0, t - (precedent ?? t)))
        precedent = t
        return lentille.appliquer(image, visage: visage(tampon, taille: image.extent.size), t: t, dt: dt, toucher: touche)
            .cropped(to: image.extent)
    }

    private func visage(_ tampon: CVPixelBuffer, taille: CGSize) -> Visage? {
        let requete = VNDetectFaceLandmarksRequest()
        try? suivi.perform([requete], on: tampon, orientation: .up)
        guard let f = requete.results?.max(by: { $0.boundingBox.width < $1.boundingBox.width }),
              let l = f.landmarks else { return nil }
        let b = VNImageRectForNormalizedRect(f.boundingBox, Int(taille.width), Int(taille.height))
        func centre(_ r: VNFaceLandmarkRegion2D?) -> CGPoint? {
            guard let pts = r?.pointsInImage(imageSize: taille), !pts.isEmpty else { return nil }
            return CGPoint(x: pts.map(\.x).reduce(0, +) / CGFloat(pts.count), y: pts.map(\.y).reduce(0, +) / CGFloat(pts.count))
        }
        func hauteur(_ r: VNFaceLandmarkRegion2D?) -> CGFloat {
            guard let pts = r?.pointsInImage(imageSize: taille), let h = pts.map(\.y).max(), let b = pts.map(\.y).min() else { return 0 }
            return h - b
        }
        guard let g = centre(l.leftPupil) ?? centre(l.leftEye), let d = centre(l.rightPupil) ?? centre(l.rightEye),
              let nez = centre(l.nose) else { return nil }
        // Bouche : hauteur intérieure des lèvres rapportée au visage (≈ 0,12 grande ouverte).
        let bouche = min(1, max(0, Double(hauteur(l.innerLips) / b.height) / 0.12))
        // Sourcils : écart sourcils-yeux comparé à une base qui suit lentement le visage au repos.
        var sourcils = 0.0
        if let sg = centre(l.leftEyebrow), let sd = centre(l.rightEyebrow) {
            let ecart = Double(((sg.y - g.y) + (sd.y - d.y)) / 2 / b.height)
            let base = baseSourcils ?? ecart
            sourcils = min(1, max(0, (ecart - base) / max(0.01, base * 0.35)))
            if sourcils < 0.3 { baseSourcils = base + (ecart - base) * 0.05 }
        }
        return Visage(boite: b, oeilG: g, oeilD: d, nez: nez, bouche: bouche, sourcils: sourcils)
    }
}
