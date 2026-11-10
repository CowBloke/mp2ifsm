import SwiftUI
import UIKit

/// Section Notifications du profil : autorisation iOS, puis les mêmes réglages que le site.
struct ReglagesNotifs: View {
    @Environment(Session.self) private var session
    @Environment(\.openURL) private var ouvrir
    private var notifs = Notifs.partage
    @State private var etat: EtatNotif?
    @State private var essai: String?
    @State private var erreur: String?

    var body: some View {
        Section {
            switch notifs.autorisation {
            case .notDetermined:
                Button("Activer les notifications") { Task { await notifs.demander(); await charger() } }
            case .denied:
                Text("Les notifications sont coupées pour mp2ifsm dans les Réglages de l’iPhone.")
                    .font(.subheadline).foregroundStyle(.secondary)
                Button("Ouvrir les Réglages") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { ouvrir(url) }
                }
            default:
                if let etat {
                    Toggle("Rappel des fiches", isOn: liaison(\.flash, cle: "flash"))
                    if etat.flash {
                        Picker("Heure du rappel", selection: liaison(\.flashHeure, cle: "flash_heure")) {
                            ForEach((etat.heureMin ?? 7)...(etat.heureMax ?? 22), id: \.self) { h in
                                Text("\(h) h").tag(h)
                            }
                        }
                    }
                    Toggle("Devoirs de la veille (19 h)", isOn: liaison(\.devoirs, cle: "devoirs"))
                    Toggle("Messages de la classe", isOn: liaison(\.messages, cle: "messages"))
                    Button("Envoyer une notification d’essai") { Task { await tester() } }
                } else {
                    ProgressView()
                }
            }
        } header: {
            Text("Notifications")
        } footer: {
            VStack(alignment: .leading, spacing: Espace.xs) {
                if let essai { Text(essai) }
                if let erreur { Text(erreur).foregroundStyle(.red) }
                if notifs.autorisation == .authorized || notifs.autorisation == .provisional {
                    Text("Le rappel ne part que s’il reste des cartes à réviser dans tes paquets suivis.")
                }
            }
        }
        .task(id: notifs.autorisation) { await charger() }
        .animation(.snappy, value: etat?.flash)
    }

    /// Liaison qui change l'affichage tout de suite puis enregistre le champ côté serveur.
    private func liaison<T: Equatable>(_ chemin: WritableKeyPath<EtatNotif, T>, cle: String) -> Binding<T> {
        Binding(
            get: { etat![keyPath: chemin] },
            set: { valeur in
                let avant = etat
                etat?[keyPath: chemin] = valeur
                Task {
                    do {
                        let r: EtatNotif = try await session.api.envoyer("PATCH", "api/app/notifications", [cle: valeur])
                        etat?.flash = r.flash; etat?.flashHeure = r.flashHeure
                        etat?.devoirs = r.devoirs; etat?.messages = r.messages
                        erreur = nil
                    } catch {
                        session.signaler(error)
                        etat = avant
                        erreur = error.localizedDescription
                    }
                }
            })
    }

    private func charger() async {
        guard notifs.autorisation != .notDetermined, notifs.autorisation != .denied else { return }
        await notifs.synchroniser()
        do { etat = try await session.api.get("api/app/notifications") }
        catch { session.signaler(error); erreur = error.localizedDescription }
    }

    private func tester() async {
        do {
            await notifs.synchroniser()
            let r: ReponseEssai = try await session.api.envoyer("POST", "api/app/notifications/test")
            essai = r.appareils > 0
                ? "Envoyée sur \(r.appareils) appareil\(r.appareils > 1 ? "s" : "")."
                : "Aucun appareil ne l’a reçue : le serveur n’est peut-être pas encore relié à Apple."
        } catch {
            session.signaler(error)
            erreur = error.localizedDescription
        }
    }
}

/// Invitation sur l'accueil, une seule fois : activer les rappels sans aller dans le profil.
struct InvitationNotifs: View {
    @Environment(Session.self) private var session
    @AppStorage("invitationNotifsVue") private var vue = false
    private var notifs = Notifs.partage

    var body: some View {
        if notifs.autorisation == .notDetermined && !vue {
            HStack(alignment: .top, spacing: Espace.m) {
                Image(systemName: "bell.badge.fill")
                    .font(.body).foregroundStyle(Color.accent)
                    .frame(width: 32, height: 32)
                    .background(Color.accent.opacity(0.12), in: .circle)
                VStack(alignment: .leading, spacing: Espace.s) {
                    Text("Ne rate plus une échéance").font(.body.weight(.semibold))
                    Text("La veille au soir pour les devoirs, et un rappel des fiches à 18 h quand il en reste.")
                        .font(.subheadline).foregroundStyle(.secondary)
                    HStack(spacing: Espace.m) {
                        Button("Activer") {
                            Task {
                                if await notifs.demander() {
                                    await notifs.synchroniser()
                                    _ = try? await session.api.envoyer("PATCH", "api/app/notifications", ["flash": true])
                                }
                                vue = true
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .buttonBorderShape(.capsule)
                        Button("Plus tard") { withAnimation(.snappy) { vue = true } }
                            .foregroundStyle(.secondary)
                    }
                    .font(.subheadline.weight(.semibold))
                    .padding(.top, Espace.xs)
                }
            }
            .carte()
            .transition(.opacity.combined(with: .scale(scale: 0.98)))
        }
    }
}
