import SwiftUI

/*
 * Connexion, ou inscription avec le code d'invitation de la classe :
 * le même écran, deux champs de plus.
 */
struct ConnexionVue: View {
    @Environment(Session.self) private var session

    @State private var inscription = false
    @State private var pseudo = ""
    @State private var email = ""
    @State private var motDePasse = ""
    @State private var code = ""
    @State private var enCours = false
    @State private var erreur: String?
    @State private var echecs = 0
    @FocusState private var champ: Champ?

    private enum Champ { case pseudo, email, motDePasse, code }

    private var complet: Bool {
        guard email.contains("@") && !motDePasse.isEmpty else { return false }
        return !inscription || (pseudo.trimmingCharacters(in: .whitespaces).count >= 2
                                && motDePasse.count >= 8 && !code.trimmingCharacters(in: .whitespaces).isEmpty)
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: Espace.xxl)

            // Emblème : une lueur douce derrière l'icône, le seul « effet » de l'écran.
            ZStack {
                Circle().fill(Color.accent.opacity(0.18)).frame(width: 120).blur(radius: 24)
                Image(systemName: "graduationcap.fill")
                    .font(.system(size: 44, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 88, height: 88)
                    .background(Color.accent.gradient, in: .rect(cornerRadius: 24, style: .continuous))
            }
            .padding(.bottom, Espace.xl)

            Text("MP2I · FSM").font(.largeTitle.weight(.semibold))
            Text("Le portail de la classe").font(.body).foregroundStyle(.secondary)
                .padding(.top, Espace.xs)

            Spacer(minLength: Espace.xxl)

            VStack(spacing: Espace.m) {
                if inscription {
                    TextField("Pseudo", text: $pseudo)
                        .textContentType(.nickname)
                        .autocorrectionDisabled()
                        .submitLabel(.next)
                        .focused($champ, equals: .pseudo)
                        .onSubmit { champ = .email }
                        .modifier(ChampSaisie())
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
                TextField("Email", text: $email)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.next)
                    .focused($champ, equals: .email)
                    .onSubmit { champ = .motDePasse }
                    .modifier(ChampSaisie())
                SecureField(inscription ? "Mot de passe (8 caractères minimum)" : "Mot de passe", text: $motDePasse)
                    .textContentType(inscription ? .newPassword : .password)
                    .submitLabel(inscription ? .next : .go)
                    .focused($champ, equals: .motDePasse)
                    .onSubmit { if inscription { champ = .code } else { Task { await valider() } } }
                    .modifier(ChampSaisie())
                if inscription {
                    TextField("Code d’invitation de la classe", text: $code)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.go)
                        .focused($champ, equals: .code)
                        .onSubmit { Task { await valider() } }
                        .modifier(ChampSaisie())
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                if let erreur {
                    Label(erreur, systemImage: "exclamationmark.circle.fill")
                        .font(.subheadline)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }

                Button(inscription ? "Créer mon compte" : "Se connecter") { Task { await valider() } }
                    .buttonStyle(BoutonPrincipal(chargement: enCours))
                    .disabled(!complet || enCours)
                    .padding(.top, Espace.s)

                Button(inscription ? "Déjà inscrit ? Se connecter" : "Pas encore de compte ? S’inscrire") {
                    withAnimation(.snappy) { inscription.toggle(); erreur = nil }
                }
                .font(.subheadline)
                .padding(.top, Espace.s)
            }
            .padding(.bottom, Espace.xl)
        }
        .padding(.horizontal, Espace.xl)
        .frame(maxWidth: 480)
        .frame(maxWidth: .infinity)
        .background(Color.fond)
        .animation(.snappy, value: erreur)
        .sensoryFeedback(.error, trigger: echecs)
    }

    private func valider() async {
        guard complet, !enCours else { return }
        enCours = true
        defer { enCours = false }
        do {
            let adresse = email.trimmingCharacters(in: .whitespaces)
            if inscription {
                try await session.inscription(pseudo: pseudo.trimmingCharacters(in: .whitespaces), email: adresse,
                                              motDePasse: motDePasse, code: code.trimmingCharacters(in: .whitespaces))
            } else {
                try await session.connexion(email: adresse, motDePasse: motDePasse)
            }
        } catch {
            erreur = error.localizedDescription
            echecs += 1
        }
    }
}

struct ChampSaisie: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.body)
            .padding(.horizontal, Espace.l)
            .frame(minHeight: 52)
            .background(Color.surface, in: .rect(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.accent.opacity(0.08)))
    }
}
