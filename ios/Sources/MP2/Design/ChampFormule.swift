import SwiftUI
import UIKit

/*
 * Champ de texte d'une carte : UITextView qui grandit avec son contenu,
 * sans guillemets ni tirets « intelligents » (ils casseraient le LaTeX),
 * avec une barre au-dessus du clavier : $…$, \, {}, ^, _ et, pour un
 * texte à trous, « Trou » qui masque la sélection ({{cN::…}}).
 * `Curseur` permet d'insérer ailleurs (une image) à la position du curseur.
 */
@MainActor
final class Curseur {
    fileprivate weak var vue: UITextView?
    fileprivate var publier: (String) -> Void = { _ in }

    /// Insère `avant` + sélection + `apres` ; sans sélection, le curseur se place entre les deux.
    func entourer(_ avant: String, _ apres: String = "") {
        guard let v = vue else { return }
        let plage = v.selectedRange
        let texte = v.text as NSString
        let choisi = texte.substring(with: plage)
        let insere = avant + choisi + apres
        v.text = texte.replacingCharacters(in: plage, with: insere)
        let fin = plage.location + (insere as NSString).length
        v.selectedRange = choisi.isEmpty
            ? NSRange(location: plage.location + (avant as NSString).length, length: 0)
            : NSRange(location: fin, length: 0)
        publier(v.text)
    }

    func inserer(_ texte: String) { entourer(texte) }

    /// Masque la sélection en nouveau trou (numéro suivant le plus grand déjà présent).
    func masquer() {
        guard let v = vue else { return }
        let numeros = (try? Regex(#"\{\{c(\d+)::"#)).map { r in
            v.text.matches(of: r).compactMap { m in m.output[1].substring.flatMap { Int($0) } }
        } ?? []
        entourer("{{c\((numeros.max() ?? 0) + 1)::", "}}")
    }
}

/// Le champ et son indication (affichée tant qu'il est vide).
struct ChampFormule: View {
    @Binding var texte: String
    let indication: String
    var trous = false
    let curseur: Curseur

    var body: some View {
        VueTexte(texte: $texte, trous: trous, curseur: curseur)
            .overlay(alignment: .topLeading) {
                if texte.isEmpty {
                    Text(indication).foregroundStyle(.tertiary)
                        .padding(.horizontal, 13).padding(.vertical, 12)
                        .allowsHitTesting(false)
                }
            }
    }
}

private struct VueTexte: UIViewRepresentable {
    @Binding var texte: String
    var trous: Bool
    let curseur: Curseur

    func makeCoordinator() -> Coordinateur { Coordinateur(texte: $texte) }

    func makeUIView(context: Context) -> UITextView {
        let v = UITextView()
        v.font = .preferredFont(forTextStyle: .body)
        v.adjustsFontForContentSizeCategory = true
        v.backgroundColor = .clear
        v.isScrollEnabled = false
        v.textContainerInset = UIEdgeInsets(top: 12, left: 8, bottom: 12, right: 8)
        v.smartQuotesType = .no
        v.smartDashesType = .no
        v.smartInsertDeleteType = .no
        v.autocorrectionType = .default
        v.delegate = context.coordinator
        v.text = texte
        v.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        lier(v, context: context)
        return v
    }

    func updateUIView(_ v: UITextView, context: Context) {
        context.coordinator.texte = $texte
        if v.text != texte { v.text = texte }
        if context.coordinator.trous != trous {
            context.coordinator.trous = trous
            v.inputAccessoryView = barre(context.coordinator)
            v.reloadInputViews()
        }
        lier(v, context: context)
    }

    func sizeThatFits(_ proposition: ProposedViewSize, uiView v: UITextView, context: Context) -> CGSize? {
        let largeur = proposition.width ?? 320
        let h = v.sizeThatFits(CGSize(width: largeur, height: .greatestFiniteMagnitude)).height
        return CGSize(width: largeur, height: max(h, 96))
    }

    private func lier(_ v: UITextView, context: Context) {
        curseur.vue = v
        let lien = $texte
        curseur.publier = { t in lien.wrappedValue = t }
        if v.inputAccessoryView == nil { v.inputAccessoryView = barre(context.coordinator) }
    }

    private func barre(_ c: Coordinateur) -> UIToolbar {
        let b = UIToolbar(frame: CGRect(x: 0, y: 0, width: 320, height: 44))
        func bouton(_ titre: String, _ action: @escaping @MainActor () -> Void) -> UIBarButtonItem {
            UIBarButtonItem(title: titre, primaryAction: UIAction { _ in action() })
        }
        let cur = curseur
        var items: [UIBarButtonItem] = [
            bouton("$…$") { cur.entourer("$", "$") },
            bouton("\\") { cur.inserer("\\") },
            bouton("{ }") { cur.entourer("{", "}") },
            bouton("^") { cur.entourer("^{", "}") },
            bouton("_") { cur.entourer("_{", "}") },
        ]
        if c.trous {
            items.append(bouton("Trou") { cur.masquer() })
        }
        items.append(.flexibleSpace())
        items.append(UIBarButtonItem(systemItem: .done, primaryAction: UIAction { [weak cur] _ in
            cur?.vue?.resignFirstResponder()
        }))
        b.items = items
        b.sizeToFit()
        return b
    }

    final class Coordinateur: NSObject, UITextViewDelegate {
        var texte: Binding<String>
        var trous = false

        init(texte: Binding<String>) { self.texte = texte }

        func textViewDidChange(_ v: UITextView) { texte.wrappedValue = v.text }
    }
}
