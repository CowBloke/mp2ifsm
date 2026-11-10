import SwiftUI
import UIKit

/*
 * Système visuel de l'app.
 *  - Grille de 8 pt (4 pour les ajustements fins).
 *  - Police système, quatre rôles : titre (navigation), corps, secondaire, légende ;
 *    deux graisses : regular et semibold. La hiérarchie vient de la taille et de
 *    l'opacité (.secondary), pas du gras partout.
 *  - Fond neutre système (60 %), texte primaire (30 %), une seule couleur
 *    d'accent (10 %) pour les actions et l'élément à voir en premier.
 *  - Couleurs de matières : exactement celles du site (oklch converties).
 */
enum Espace {
    static let xs: CGFloat = 4
    static let s: CGFloat = 8
    static let m: CGFloat = 12
    static let l: CGFloat = 16
    static let xl: CGFloat = 24
    static let xxl: CGFloat = 32
    static let xxxl: CGFloat = 48
}

enum Rayon {
    static let carte: CGFloat = 20
    static let element: CGFloat = 12
}

extension Color {
    /// Couleur à deux teintes (clair / sombre).
    init(clair: UInt32, sombre: UInt32) {
        self.init(uiColor: UIColor { trait in
            let v = trait.userInterfaceStyle == .dark ? sombre : clair
            return UIColor(red: CGFloat((v >> 16) & 0xFF) / 255,
                           green: CGFloat((v >> 8) & 0xFF) / 255,
                           blue: CGFloat(v & 0xFF) / 255, alpha: 1)
        })
    }

    static let accent = Color(clair: 0x4F5BD5, sombre: 0x9AA3FF)
    static let fond = Color(uiColor: .systemGroupedBackground)
    static let surface = Color(uiColor: .secondarySystemGroupedBackground)

    /// Teintes du site : `--matiere-<clé>` en clair (L 0,52) et en sombre (L 0,76).
    private static let palette: [String: (UInt32, UInt32)] = [
        "rouge": (0x9A504B, 0xEF958E), "orange": (0x95572E, 0xE99D6E),
        "ambre": (0x876114, 0xD6A95B), "olive": (0x6B6E1F, 0xB3B862),
        "vert": (0x397949, 0x7CC58C), "sarcelle": (0x0E7A6D, 0x50C8B6),
        "cyan": (0x037687, 0x4AC3DA), "bleu": (0x3B6CA1, 0x7CB5F5),
        "indigo": (0x5A63A2, 0x9EABF7), "violet": (0x745A99, 0xBEA0EB),
        "magenta": (0x895284, 0xD997D2), "rose": (0x954F6B, 0xE993B3),
    ]

    /// Couleur d'une matière ; « sans matière » reste neutre.
    static func matiere(_ cle: String?) -> Color {
        guard let cle, let (c, s) = palette[cle] else { return .secondary }
        return Color(clair: c, sombre: s)
    }
}

// MARK: Composants

/// Surface arrondie posée sur le fond groupé, ombre douce teintée.
struct Carte: ViewModifier {
    var marge: CGFloat = Espace.l
    func body(content: Content) -> some View {
        content
            .padding(marge)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.surface, in: .rect(cornerRadius: Rayon.carte, style: .continuous))
            .shadow(color: Color.accent.opacity(0.06), radius: 16, y: 6)
    }
}

extension View {
    func carte(marge: CGFloat = Espace.l) -> some View { modifier(Carte(marge: marge)) }
}

/// Étiquette de matière : texte coloré sur un fond de la même teinte à 12 %.
struct PastilleMatiere: View {
    let nom: String
    let couleur: String?

    var body: some View {
        Text(nom)
            .font(.caption.weight(.semibold))
            .foregroundStyle(Color.matiere(couleur))
            .padding(.horizontal, Espace.s)
            .padding(.vertical, Espace.xs)
            .background(Color.matiere(couleur).opacity(0.12), in: .capsule)
    }
}

/// Titre de section au-dessus d'un groupe de cartes.
struct TitreSection: View {
    let titre: String
    var detail: String? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(titre).font(.title3.weight(.semibold))
            Spacer()
            if let detail { Text(detail).font(.subheadline).foregroundStyle(.secondary) }
        }
        .padding(.horizontal, Espace.xs)
        .accessibilityAddTraits(.isHeader)
    }
}

/// Bouton plein principal : large, dans la zone du pouce.
struct BoutonPrincipal: ButtonStyle {
    var chargement = false
    @Environment(\.isEnabled) private var actif

    func makeBody(configuration: Configuration) -> some View {
        ZStack {
            configuration.label.opacity(chargement ? 0 : 1)
            if chargement { ProgressView().tint(.white) }
        }
        .font(.body.weight(.semibold))
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, minHeight: 52)
        .background(Color.accent.opacity(actif ? 1 : 0.4), in: .rect(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
            .strokeBorder(.white.opacity(0.18), lineWidth: 1).blendMode(.overlay))
        .shadow(color: Color.accent.opacity(actif ? 0.28 : 0), radius: 12, y: 6)
        .scaleEffect(configuration.isPressed ? 0.98 : 1)
        .animation(.snappy(duration: 0.2), value: configuration.isPressed)
    }
}
