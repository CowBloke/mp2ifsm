import SwiftUI
import WebKit

/*
 * Contenu d'une carte : le HTML déjà composé par le serveur (KaTeX
 * compris), affiché tel quel pour que les formules soient identiques au
 * site. La feuille KaTeX vient du site (publique, mise en cache).
 * Les images des cartes demandent une session : elles passent par le
 * schéma `mp2img:` que l'app sert avec son jeton.
 * La vue prend la hauteur de son contenu et se pose dans un ScrollView.
 *
 * Fluidité : la carte reste invisible tant que sa hauteur n'est pas
 * mesurée (pas de saut de 44 pt à la vraie taille), puis apparaît en
 * fondu. Un nouveau HTML dans une page déjà chargée (réponse révélée)
 * remplace seulement le contenu, sans recharger la page ni clignoter.
 */
struct CarteHTML: View {
    let html: String
    /// Trous déjà ouverts (indice → HTML de la réponse), carte à plusieurs trous.
    var trousOuverts: [Int: String] = [:]
    @Environment(Session.self) private var session
    @State private var hauteur: CGFloat = 44
    @State private var mesuree = false

    var body: some View {
        VueWeb(html: html, trous: trousOuverts, jeton: session.api.jeton, hauteur: $hauteur, mesuree: $mesuree)
            .frame(height: hauteur)
            .opacity(mesuree ? 1 : 0)
            .animation(.smooth(duration: 0.2), value: mesuree)
            .accessibilityElement(children: .contain)
    }
}

private struct VueWeb: UIViewRepresentable {
    let html: String
    let trous: [Int: String]
    let jeton: String?
    @Binding var hauteur: CGFloat
    @Binding var mesuree: Bool

    func makeCoordinator() -> Coordinateur { Coordinateur(hauteur: $hauteur, mesuree: $mesuree) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let images = ImagesCartes()
        images.jeton = jeton
        context.coordinator.images = images
        config.setURLSchemeHandler(images, forURLScheme: "mp2img")
        config.userContentController.add(context.coordinator, name: "hauteur")
        config.dataDetectorTypes = []
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.isScrollEnabled = false
        web.scrollView.backgroundColor = .clear
        web.navigationDelegate = context.coordinator
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        let c = context.coordinator
        c.images?.jeton = jeton
        if c.html != html {
            c.html = html
            c.trousAppliques = []
            c.enAttente = trous
            if c.charge, let litteral = Self.litteralJS(Self.corps(html)) {
                web.evaluateJavaScript("remplacer(\(litteral))") { _, _ in c.appliquer(c.enAttente, dans: web) }
            } else {
                web.loadHTMLString(Self.page(html), baseURL: API.base)
            }
        } else {
            c.appliquer(trous, dans: web)
        }
    }

    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinateur) {
        web.configuration.userContentController.removeScriptMessageHandler(forName: "hauteur")
    }

    /// Images de cartes (`/api/fiches/image/<id>`) servies par le schéma authentifié.
    private static func corps(_ html: String) -> String {
        html.replacingOccurrences(of: "src=\"/api/fiches/image/", with: "src=\"mp2img:///api/fiches/image/")
    }

    /// Chaîne Swift → littéral de chaîne JavaScript.
    static func litteralJS(_ texte: String) -> String? {
        guard let json = try? JSONSerialization.data(withJSONObject: [texte]),
              let tableau = String(data: json, encoding: .utf8) else { return nil }
        return "\(tableau)[0]"
    }

    private static func page(_ html: String) -> String {
        let contenu = corps(html)
        return """
        <!doctype html><html><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
        <link rel="stylesheet" href="/katex/katex.min.css">
        <style>
        :root { color-scheme: light dark; --texte:#000; --discret:rgba(60,60,67,.6); --accent:#4F5BD5; --erreur:#FF3B30; }
        @media (prefers-color-scheme: dark) { :root { --texte:#fff; --discret:rgba(235,235,245,.6); --accent:#9AA3FF; --erreur:#FF453A; } }
        html, body { margin:0; padding:0; background:transparent; }
        body { font: -apple-system-body; font-size: 19px; line-height: 1.55; color: var(--texte);
               overflow-wrap: anywhere; -webkit-text-size-adjust: 100%; -webkit-user-select: text; }
        .texte { white-space: pre-wrap; }
        .trou { font-weight: 600; color: var(--discret); }
        .trou-revele { text-decoration: underline 2px var(--accent); text-underline-offset: 5px; animation: in .18s ease-out; }
        @keyframes in { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; } }
        .katex { font-size: 1.08em; }
        .katex-display { margin: .4em 0; text-align: left; }
        .bloc-maths, body > .katex, body > .trou-formule { max-width: 100%; overflow-x: auto; overflow-y: hidden; }
        body > .katex, body > .trou-formule { display: inline-block; vertical-align: middle; padding-block: .15em; }
        .maths-erreur { color: var(--erreur); font-size: .9em; }
        .image-refusee { color: var(--discret); font-size: .8em; }
        img { display:block; margin:.5rem auto; max-width:100%; max-height:18rem; height:auto; border-radius:10px; object-fit:contain; }
        </style></head><body><div id="c">\(contenu)</div>
        <script>
        const signaler = () => webkit.messageHandlers.hauteur.postMessage(Math.ceil(document.body.scrollHeight));
        const images = () => document.querySelectorAll('img').forEach(i => i.addEventListener('load', signaler));
        new ResizeObserver(signaler).observe(document.body);
        images();
        function remplacer(html) { document.getElementById('c').innerHTML = html; images(); signaler(); }
        function ouvrirTrou(i, html) {
          document.querySelectorAll('[data-trou="' + i + '"]').forEach(e => {
            const s = document.createElement(e.tagName === 'DIV' ? 'div' : 'span');
            s.className = 'trou-revele'; s.innerHTML = html; e.replaceWith(s);
          });
          signaler();
        }
        </script></body></html>
        """
    }

    final class Coordinateur: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        var hauteur: Binding<CGFloat>
        var mesuree: Binding<Bool>
        var html: String?
        var trousAppliques: Set<Int> = []
        var enAttente: [Int: String] = [:]
        var charge = false
        var images: ImagesCartes?

        init(hauteur: Binding<CGFloat>, mesuree: Binding<Bool>) { self.hauteur = hauteur; self.mesuree = mesuree }

        func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let h = message.body as? Double, h > 0 else { return }
            let nouvelle = CGFloat(h)
            if abs(hauteur.wrappedValue - nouvelle) > 0.5 { hauteur.wrappedValue = nouvelle }
            if !mesuree.wrappedValue { mesuree.wrappedValue = true }
        }

        func webView(_ web: WKWebView, didFinish navigation: WKNavigation!) {
            charge = true
            appliquer(enAttente, dans: web)
        }

        func webView(_ web: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { charge = false }

        /// Liens éventuels : ouverts dans Safari, jamais dans la carte.
        func webView(_ web: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if action.navigationType == .linkActivated, let url = action.request.url {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
            } else {
                decisionHandler(.allow)
            }
        }

        func appliquer(_ trous: [Int: String], dans web: WKWebView) {
            guard charge else { enAttente = trous; return }
            for (i, html) in trous where !trousAppliques.contains(i) {
                trousAppliques.insert(i)
                guard let litteral = VueWeb.litteralJS(html) else { continue }
                web.evaluateJavaScript("ouvrirTrou(\(i), \(litteral))")
            }
        }
    }
}

/// Sert `mp2img:///api/fiches/image/<id>` en appelant le site avec le jeton.
final class ImagesCartes: NSObject, WKURLSchemeHandler {
    var jeton: String?
    private var taches: [ObjectIdentifier: URLSessionDataTask] = [:]

    func webView(_ webView: WKWebView, start tache: WKURLSchemeTask) {
        guard let chemin = tache.request.url?.path, chemin.hasPrefix("/api/fiches/image/") else {
            tache.didFailWithError(URLError(.badURL)); return
        }
        var req = URLRequest(url: API.base.appending(path: String(chemin.dropFirst())))
        if let jeton { req.setValue("Bearer \(jeton)", forHTTPHeaderField: "Authorization") }
        req.cachePolicy = .returnCacheDataElseLoad
        let cle = ObjectIdentifier(tache)
        let t = URLSession.shared.dataTask(with: req) { [weak self] donnees, reponse, erreur in
            DispatchQueue.main.async {
                guard self?.taches.removeValue(forKey: cle) != nil else { return }   // tâche arrêtée entre-temps
                if let donnees, let reponse { tache.didReceive(reponse); tache.didReceive(donnees); tache.didFinish() }
                else { tache.didFailWithError(erreur ?? URLError(.unknown)) }
            }
        }
        taches[cle] = t
        t.resume()
    }

    func webView(_ webView: WKWebView, stop tache: WKURLSchemeTask) {
        taches.removeValue(forKey: ObjectIdentifier(tache))?.cancel()
    }
}
