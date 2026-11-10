import SwiftUI

/*
 * Réels : la blague du site (src/lib/reels.ts), en natif. Un fil vertical
 * plein écran où chaque « réel » est un nombre réel tiré au hasard, avec
 * légende, auteur, son, j'aime, commentaires et partage. Tout est généré
 * sur le téléphone ; rien n'est enregistré ni envoyé.
 */
struct ReelsVue: View {
    let pseudo: String
    @Environment(\.dismiss) private var fermer
    @State private var reels: [Reel] = []
    @State private var etats: [String: EtatReel] = [:]
    @State private var courant: String?
    @State private var commentaires: Reel?
    @State private var generateur = GenerateurReels()

    var body: some View {
        ScrollView(.vertical) {
            LazyVStack(spacing: 0) {
                ForEach(reels) { r in
                    EcranReel(reel: r, etat: etat(r.id), actif: courant == r.id,
                              aimer: { force in modifier(r.id) { $0.aime = force ?? !$0.aime } },
                              suivre: { modifier(r.id) { $0.suivi.toggle() } },
                              ouvrirCommentaires: { commentaires = r })
                        .containerRelativeFrame([.horizontal, .vertical])
                        .id(r.id)
                        .onAppear {
                            // Défilement infini : la suite est prête trois réels avant la fin.
                            if let i = reels.firstIndex(where: { $0.id == r.id }), i >= reels.count - 3 { ajouterLot() }
                        }
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $courant)
        .scrollIndicators(.hidden)
        .ignoresSafeArea()
        .background(.black)
        .overlay(alignment: .top) {
            HStack(spacing: Espace.m) {
                Button { fermer() } label: {
                    Image(systemName: "chevron.left").font(.title3.weight(.semibold)).frame(width: 44, height: 44)
                }
                .accessibilityLabel("Fermer les réels")
                Text("Réels ").font(.title3.weight(.bold)) + Text("ℝ").font(.title3.weight(.semibold)).foregroundStyle(.white.opacity(0.7))
                Spacer()
            }
            .foregroundStyle(.white)
            .shadow(color: .black.opacity(0.35), radius: 6)
            .padding(.horizontal, Espace.s)
        }
        .sheet(item: $commentaires) { r in
            CommentairesReel(reel: r, pseudo: pseudo, ajoutes: etat(r.id).ajoutes) { texte in
                modifier(r.id) {
                    $0.ajoutes.insert(CommentaireReel(id: "\(r.id)-m\($0.ajoutes.count)", auteur: pseudo, texte: texte,
                                                      likes: 0, ilYa: "à l’instant"), at: 0)
                }
            }
            .presentationDetents([.fraction(0.7), .large])
            .presentationDragIndicator(.visible)
        }
        .environment(\.colorScheme, .dark)
        .statusBarHidden()
        .onAppear { if reels.isEmpty { ajouterLot() } }
    }

    private func ajouterLot() {
        reels += (0..<6).map { _ in generateur.reel(pseudo: pseudo) }
    }

    private func etat(_ id: String) -> EtatReel { etats[id] ?? EtatReel() }

    private func modifier(_ id: String, _ f: (inout EtatReel) -> Void) {
        var e = etat(id)
        f(&e)
        etats[id] = e
    }
}

struct EtatReel {
    var aime = false
    var suivi = false
    var ajoutes: [CommentaireReel] = []
}

private struct EcranReel: View {
    let reel: Reel
    let etat: EtatReel
    let actif: Bool
    let aimer: (Bool?) -> Void
    let suivre: () -> Void
    let ouvrirCommentaires: () -> Void
    @State private var coeur: (point: CGPoint, cle: Int)?

    private var taille: CGFloat {
        switch reel.valeur.count {
        case ...3: 120
        case ...6: 88
        case ...10: 60
        case ...14: 44
        default: 36
        }
    }

    var body: some View {
        ZStack {
            FondReel(teinte: reel.teinte)

            VStack(spacing: Espace.m) {
                Text(reel.valeur)
                    .font(.system(size: taille, weight: .bold, design: .rounded)).monospacedDigit()
                    .minimumScaleFactor(0.4).lineLimit(2)
                if let s = reel.sous {
                    Text(s).font(.title2.weight(.medium)).monospacedDigit().opacity(0.8)
                }
            }
            .multilineTextAlignment(.center)
            .padding(.horizontal, Espace.xxl)
            .accessibilityElement(children: .combine)

            if let coeur {
                Image(systemName: "heart.fill")
                    .font(.system(size: 110)).foregroundStyle(Color(red: 1, green: 0.19, blue: 0.25))
                    .position(coeur.point)
                    .transition(.scale(scale: 0.4).combined(with: .opacity))
                    .id(coeur.cle)
                    .allowsHitTesting(false)
            }

            HStack(alignment: .bottom, spacing: Espace.l) {
                VStack(alignment: .leading, spacing: Espace.s) {
                    HStack(spacing: Espace.s) {
                        Text(reel.auteur.prefix(1).uppercased())
                            .font(.subheadline.weight(.bold)).frame(width: 36, height: 36)
                            .background(.white.opacity(0.2), in: .circle)
                        Text(reel.auteur).font(.subheadline.weight(.semibold)).lineLimit(1)
                        Button(etat.suivi ? "Suivi(e)" : "Suivre", action: suivre)
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, Espace.m).frame(minHeight: 28)
                            .overlay(Capsule().strokeBorder(.white.opacity(0.7)))
                            .sensoryFeedback(.selection, trigger: etat.suivi)
                    }
                    Text(reel.legende).font(.subheadline)
                    Label(reel.son, systemImage: "music.note").font(.footnote).lineLimit(1).opacity(0.9)
                }
                Spacer(minLength: 0)
                VStack(spacing: Espace.l) {
                    action(etat.aime ? "heart.fill" : "heart", reel.likes + (etat.aime ? 1 : 0),
                           teinte: etat.aime ? Color(red: 1, green: 0.19, blue: 0.25) : .white,
                           libelle: etat.aime ? "Je n’aime plus" : "J’aime") { aimer(nil) }
                        .sensoryFeedback(.impact(weight: .light), trigger: etat.aime)
                    action("bubble.right", reel.nbCommentaires + etat.ajoutes.count, libelle: "Commentaires",
                           faire: ouvrirCommentaires)
                    ShareLink(item: "Regarde ce réel : \(reel.valeur)\(reel.sous.map { " (\($0))" } ?? "")") {
                        VStack(spacing: Espace.xs) {
                            Image(systemName: "paperplane").font(.system(size: 28))
                            Text(Self.compte(reel.partages)).font(.caption.weight(.semibold)).monospacedDigit()
                        }
                    }
                    .accessibilityLabel("Partager")
                }
            }
            .foregroundStyle(.white)
            .padding(.horizontal, Espace.l)
            .padding(.bottom, Espace.xxxl)
            .frame(maxHeight: .infinity, alignment: .bottom)
        }
        .foregroundStyle(.white)
        .contentShape(.rect)
        .onTapGesture(count: 2) { point in
            withAnimation(.spring(response: 0.3, dampingFraction: 0.55)) { coeur = (point, (coeur?.cle ?? 0) + 1) }
            aimer(true)
            let cle = coeur?.cle
            Task {
                try? await Task.sleep(for: .milliseconds(700))
                if coeur?.cle == cle { withAnimation(.easeOut(duration: 0.25)) { coeur = nil } }
            }
        }
    }

    private func action(_ symbole: String, _ n: Int, teinte: Color = .white, libelle: String,
                        faire: @escaping () -> Void) -> some View {
        Button(action: faire) {
            VStack(spacing: Espace.xs) {
                Image(systemName: symbole).font(.system(size: 28)).foregroundStyle(teinte)
                    .contentTransition(.symbolEffect(.replace))
                Text(Self.compte(n)).font(.caption.weight(.semibold)).monospacedDigit()
            }
        }
        .accessibilityLabel("\(libelle) (\(n))")
    }

    /// 12 400 → « 12,4 k », 1 230 000 → « 1,2 M » (formatCompte du site).
    static func compte(_ n: Int) -> String {
        guard n >= 1000 else { return "\(n)" }
        let (d, s): (Double, String) = n < 1_000_000 ? (1e3, "k") : (1e6, "M")
        let v = Double(n) / d
        let arrondi = v < 100 ? (v * 10).rounded(.down) / 10 : v.rounded(.down)
        let texte = arrondi == arrondi.rounded() ? String(Int(arrondi)) : String(arrondi).replacingOccurrences(of: ".", with: ",")
        return "\(texte) \(s)"
    }
}

/// Deux halos de couleur sur un fond très sombre, d'après la teinte du réel.
private struct FondReel: View {
    let teinte: Int
    var body: some View {
        let h = Double(teinte) / 360
        let h2 = Double((teinte + 60) % 360) / 360
        ZStack {
            Color(hue: h, saturation: 0.55, brightness: 0.14)
            RadialGradient(colors: [Color(hue: h, saturation: 0.7, brightness: 0.55).opacity(0.9), .clear],
                           center: UnitPoint(x: 0.25, y: 0.15), startRadius: 0, endRadius: 520)
            RadialGradient(colors: [Color(hue: h2, saturation: 0.75, brightness: 0.45), .clear],
                           center: UnitPoint(x: 0.85, y: 0.9), startRadius: 0, endRadius: 440)
        }
        .ignoresSafeArea()
    }
}

private struct CommentairesReel: View {
    let reel: Reel
    let pseudo: String
    let ajoutes: [CommentaireReel]
    let ajouter: (String) -> Void
    @State private var texte = ""
    @State private var aimes: Set<String> = []

    var body: some View {
        NavigationStack {
            List(ajoutes + reel.commentaires) { c in
                let aime = aimes.contains(c.id)
                HStack(alignment: .top, spacing: Espace.m) {
                    Text(c.auteur.prefix(1).uppercased())
                        .font(.caption.weight(.bold)).frame(width: 32, height: 32)
                        .background(Color.secondary.opacity(0.2), in: .circle)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: Espace.s) {
                            Text(c.auteur).font(.footnote.weight(.semibold))
                            Text(c.ilYa).font(.footnote).foregroundStyle(.secondary)
                        }
                        Text(c.texte).font(.subheadline)
                    }
                    Spacer(minLength: 0)
                    Button {
                        if aime { aimes.remove(c.id) } else { aimes.insert(c.id) }
                    } label: {
                        VStack(spacing: 2) {
                            Image(systemName: aime ? "heart.fill" : "heart")
                                .foregroundStyle(aime ? Color(red: 1, green: 0.19, blue: 0.25) : .secondary)
                            Text(EcranReel.compte(c.likes + (aime ? 1 : 0))).font(.caption2).monospacedDigit()
                                .foregroundStyle(.secondary)
                        }
                        .frame(width: 36)
                    }
                    .buttonStyle(.plain)
                    .sensoryFeedback(.impact(weight: .light), trigger: aime)
                }
                .listRowSeparator(.hidden)
            }
            .listStyle(.plain)
            .navigationTitle("Commentaires")
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom) {
                HStack(spacing: Espace.s) {
                    TextField("Commenter en tant que \(pseudo)…", text: $texte)
                        .padding(.horizontal, Espace.l).frame(minHeight: 44)
                        .background(Color.secondary.opacity(0.15), in: .capsule)
                        .onSubmit(publier)
                    Button("Publier", action: publier).disabled(texte.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                .padding(Espace.m)
                .background(.bar)
            }
        }
    }

    private func publier() {
        let t = texte.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        ajouter(String(t.prefix(300)))
        texte = ""
    }
}

// MARK: Générateur (port de src/lib/reels.ts)

struct CommentaireReel: Identifiable, Hashable {
    let id: String
    let auteur: String
    let texte: String
    let likes: Int
    let ilYa: String
}

struct Reel: Identifiable, Hashable {
    let id: String
    let valeur: String
    let sous: String?
    let legende: String
    let auteur: String
    let son: String
    let likes: Int
    let partages: Int
    let nbCommentaires: Int
    let commentaires: [CommentaireReel]
    let teinte: Int
}

struct GenerateurReels {
    private var compteur = 0
    private var derniereTeinte = 0

    private static let auteurs = [
        "cauchy_schwarz", "epsilon.delta", "le_vrai_bolzano", "dedekind.coupes", "sup_et_inf",
        "weierstrass_fan", "topologue_en_sueur", "suite_de_cauchy", "borne.sup", "archimede_off",
        "densite_de_Q", "theoreme_des_gendarmes", "TVI_officiel", "ln_de_ma_vie", "racine_de_deux",
        "lhopital_interdit", "dl_a_lordre_5", "rolle_model", "riemann_mais_sympa", "un_reel_par_jour",
        "integrale_impropre", "zeta_de_3", "euler.gamma", "nombre_premier_jsp", "khôlleur_anonyme",
        "corps_ordonne", "partie_entiere", "valeur_absolue", "le_compactifie", "ensemble_vide",
    ]

    private static let constantes: [(valeur: String, nom: String, legendes: [String])] = [
        ("3,14159265358979…", "π", ["π mais en 4K", "le classique. jamais démodé", "π sans filtre, sans retouche"]),
        ("2,71828182845904…", "e", ["e, la base (au sens propre)", "il est sa propre dérivée et il le vit bien"]),
        ("1,41421356237309…", "√2", ["√2, irrationnel depuis l'Antiquité", "les pythagoriciens détestent ce réel"]),
        ("1,61803398874989…", "φ", ["le nombre d'or, rien que ça", "φ, proportions parfaites ✨"]),
        ("0,69314718055994…", "ln 2", ["ln 2, discret mais partout", "∑ (−1)ⁿ⁺¹/n, voilà"]),
        ("0,57721566490153…", "γ", ["γ : on ne sait même pas s'il est irrationnel 😳", "constante d'Euler–Mascheroni, mystère total"]),
        ("1,20205690315959…", "ζ(3)", ["la constante d'Apéry, irrationnelle depuis 1978", "ζ(3) passe enfin dans le fil"]),
        ("0,99999999999999…", "0,999…", ["= 1. débat dans les commentaires 👇", "ce réel est 1, il ne le sait pas encore"]),
    ]

    private static let legendes = [
        "aucun filtre 🔥", "nouveau réel, dites-moi ce que vous en pensez", "tiré au hasard, comme mes notes de DS",
        "il était là avant ℚ", "vu en colle aujourd'hui", "pas rationnel, pas de problème", "trouvé dans un intervalle ouvert",
        "un réel par jour éloigne le khôlleur", "majoré, mais pas par vous", "pov : tu tires un réel uniformément",
        "il n'admet pas de développement décimal fini et il l'assume", "#réels #ℝ #pourtoi", "le TVI m'a ramené ça",
        "en direct de la droite numérique", "ça passe au voisinage, ça s'arrête", "qualité : densité maximale",
    ]

    private static let textes = [
        "j'en pleure, quelle densité 😭", "le meilleur réel de la semaine", "Archimède aurait liké",
        "Cauchy approuve ce réel", "je l'ai mis en fond d'écran", "borne supérieure de mon cœur ❤️",
        "{n} c'est littéralement moi", "ça converge 🔥🔥", "pas besoin de l'axiome du choix pour choisir celui-là",
        "Weierstrass serait fier", "plus beau que π (désolé π)", "il est où le contenu dans ℚ ? 👀",
        "j'ai montré {n} à mon colleur, il a pleuré", "ce nombre a changé ma vie", "rien à voir mais {n} 😍",
        "on veut une partie 2", "le cadrage, l'éclairage, les décimales… tout est parfait", "QUELLE VALEUR",
        "{n} > tout le reste", "je l'ai vu en vrai sur la droite réelle, il est encore plus beau", "masterclass",
        "Dedekind a coupé pile au bon endroit", "c'est quand le prochain ?", "ça m'a fait réviser mieux que mes fiches",
        "le son est incroyable aussi", "première ! (je suis le plus petit majorant)", "abonné direct",
        "irrationnel comme mon amour pour ce compte", "j'arrive pas à m'arrêter de scroller ℝ", "pépite",
        "le prof de maths a liké ??", "trop proche de 0 pour moi mais respect", "je le connaissais avant qu'il soit connu",
        "on dirait un DL à l'ordre infini", "ce réel admet une limite : la perfection", "😮‍💨😮‍💨😮‍💨",
    ]

    private static let durees = ["1 min", "4 min", "12 min", "36 min", "1 h", "2 h", "5 h", "9 h", "1 j", "2 j", "3 j", "1 sem"]
    private static let sons = ["Bruit blanc (uniforme sur [0,1])", "Le TVI (remix)", "Suite harmonique · diverge lentement", "Série de Fourier · lo-fi"]

    private func r() -> Double { Double.random(in: 0..<1) }
    private func entier(_ min: Int, _ max: Int) -> Int { Int.random(in: min...max) }
    private func chiffres(_ n: Int) -> String { String((0..<n).map { _ in Character(String(Int.random(in: 0...9))) }) }

    /// Partie entière groupée par trois (espace fine), virgule décimale.
    private func decimal(_ signe: String, _ entiere: String, _ decimales: String) -> String {
        var groupes: [String] = []
        var reste = Substring(entiere)
        while reste.count > 3 { groupes.insert(String(reste.suffix(3)), at: 0); reste = reste.dropLast(3) }
        groupes.insert(String(reste), at: 0)
        return signe + groupes.joined(separator: "\u{202F}") + (decimales.isEmpty ? "" : "," + decimales)
    }

    private func exposant(_ n: Int) -> String {
        let table: [Character: Character] = ["-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
                                             "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹"]
        return String(String(n).compactMap { table[$0] })
    }

    private func nombre() -> (valeur: String, sous: String?, legende: String?) {
        let t = r()
        let signe = r() < 0.2 ? "−" : ""
        switch t {
        case ..<0.38:
            return (decimal(signe, String(entier(0, r() < 0.5 ? 99 : 99_999)), chiffres(entier(1, 12))), nil, nil)
        case ..<0.5:
            return (decimal(signe, String(entier(0, r() < 0.7 ? 999 : 9_999_999)), ""), nil, nil)
        case ..<0.6:
            var fin = chiffres(entier(1, 4))
            if fin.hasPrefix("0") { fin = "1" + fin.dropFirst() }
            return (decimal(signe, "0", String(repeating: "0", count: entier(3, 8)) + fin), nil, "minuscule mais costaud")
        case ..<0.7:
            var e = entier(-40, 40)
            if e == 0 { e = 23 }
            return ("\(signe)\(entier(1, 9)),\(chiffres(entier(1, 3))) × 10\(exposant(e))", nil,
                    e > 0 ? "ce réel est énorme, faites de la place" : "zoom ×10¹² pour le voir")
        case ..<0.8:
            var n = entier(2, 200)
            while Double(n).squareRoot().rounded() * Double(n).squareRoot().rounded() == Double(n) { n += 1 }
            let v = String(format: "%.10f", Double(n).squareRoot()).replacingOccurrences(of: ".", with: ",")
            return ("√\(n)", "≈ \(v)…", "√\(n), enfin quelqu'un qui en parle")
        case ..<0.83:
            return [("0", nil, "le neutre absolu. respect."), ("1", nil, "l'unité. iconique."),
                    ("−1", nil, "e^{iπ} m'a envoyé")].randomElement()!
        default:
            let c = Self.constantes.randomElement()!
            return (c.valeur, c.nom == "0,999…" ? nil : c.nom, c.legendes.randomElement())
        }
    }

    private func autreAuteur(_ sauf: String) -> String {
        let a = Self.auteurs.randomElement()!
        guard a == sauf, let i = Self.auteurs.firstIndex(of: a) else { return a }
        return Self.auteurs[(i + 1) % Self.auteurs.count]
    }

    mutating func reel(pseudo: String?) -> Reel {
        compteur += 1
        let id = "\(Int(Date().timeIntervalSince1970 * 1000))-\(compteur)-\(Int.random(in: 0..<1_000_000_000))"
        let n = nombre()
        let auteur = Self.auteurs.randomElement()!
        let likes = Int(pow(10, 2.3 + r() * 4.2))
        let affiche = n.sous.flatMap { $0.hasPrefix("≈") ? nil : $0 } ?? n.valeur

        var vus: Set<String> = []
        var commentaires: [CommentaireReel] = []
        for i in 0..<entier(4, 9) {
            let brut = Self.textes.randomElement()!
            guard vus.insert(brut).inserted else { continue }
            commentaires.append(CommentaireReel(id: "\(id)-c\(i)", auteur: autreAuteur(auteur),
                                                texte: brut.replacingOccurrences(of: "{n}", with: affiche),
                                                likes: Int(Double(likes) * r() * 0.08), ilYa: Self.durees.randomElement()!))
        }
        if let pseudo, r() < 0.25 {
            commentaires.insert(CommentaireReel(id: "\(id)-tag", auteur: autreAuteur(auteur), texte: "@\(pseudo) regarde ça 😭😭",
                                                likes: entier(1, 40), ilYa: Self.durees.randomElement()!),
                                at: entier(0, commentaires.count))
        }
        commentaires.sort { $0.likes > $1.likes }

        // Deux réels voisins ne partagent jamais la même ambiance.
        derniereTeinte = Int(Double(derniereTeinte) + 70 + r() * 220) % 360
        return Reel(
            id: id, valeur: n.valeur, sous: n.sous,
            legende: n.legende.flatMap { r() < 0.7 ? $0 : nil } ?? Self.legendes.randomElement()!,
            auteur: auteur,
            son: r() < 0.6 ? "Son original · \(auteur)" : Self.sons.randomElement()!,
            likes: likes,
            partages: Int(Double(likes) * (0.02 + r() * 0.1)),
            nbCommentaires: commentaires.count + Int(Double(likes) * (0.005 + r() * 0.03)),
            commentaires: commentaires,
            teinte: derniereTeinte)
    }
}
