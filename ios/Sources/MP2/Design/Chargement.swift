import SwiftUI

/*
 * Charge une ressource et gère ses états : chargement, erreur (avec
 * « Réessayer »), contenu, tirer pour rafraîchir. Une session expirée
 * renvoie à la connexion. Le contenu reçoit `recharger` pour se mettre
 * à jour après une modification.
 *
 * Fluidité :
 * - pendant un rechargement, l'ancien contenu reste affiché : rien ne clignote ;
 * - la dernière réponse de chaque écran est gardée en mémoire (`Session.memoire`),
 *   un écran déjà vu s'affiche donc aussitôt puis se rafraîchit en silence ;
 * - au retour dans l'app, un écran vieux de plus de deux minutes se met à jour ;
 * - un rafraîchissement raté garde le contenu et le signale par un bandeau discret.
 *
 * `cle` doit identifier entièrement la ressource : elle sert aussi de clé de cache.
 */
struct Chargement<Valeur: Sendable, Contenu: View>: View {
    let cle: AnyHashable
    let charger: @Sendable (API) async throws -> Valeur
    @ViewBuilder let contenu: (Valeur, _ recharger: @escaping () async -> Void) -> Contenu

    init(cle: AnyHashable = 0,
         _ charger: @escaping @Sendable (API) async throws -> Valeur,
         @ViewBuilder contenu: @escaping (Valeur, _ recharger: @escaping () async -> Void) -> Contenu) {
        self.cle = cle
        self.charger = charger
        self.contenu = contenu
    }

    @Environment(Session.self) private var session
    @Environment(\.scenePhase) private var phase
    @State private var valeur: Valeur?
    @State private var erreur: String?
    @State private var avertissement: String?
    @State private var chargeLe: Date?

    private var cleMemoire: String { "\(Valeur.self)|\(type(of: cle.base))|\(cle)" }

    var body: some View {
        Group {
            if let valeur {
                contenu(valeur, recharger)
            } else if let erreur {
                ContentUnavailableView {
                    Label("Impossible de charger", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(erreur)
                } actions: {
                    Button("Réessayer") { Task { await recharger() } }
                        .buttonStyle(.borderedProminent)
                }
            } else {
                ProgressView()
                    .controlSize(.large)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .overlay(alignment: .top) {
            if let avertissement {
                Label(avertissement, systemImage: "wifi.slash")
                    .font(.footnote.weight(.medium))
                    .padding(.horizontal, Espace.l)
                    .padding(.vertical, Espace.s)
                    .background(.regularMaterial, in: .capsule)
                    .padding(.top, Espace.s)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .task {
                        try? await Task.sleep(for: .seconds(3))
                        withAnimation(.smooth) { self.avertissement = nil }
                    }
            }
        }
        .task(id: cle) {
            if let m = session.memoire[cleMemoire], let v = m.valeur as? Valeur {
                valeur = v
                erreur = nil
                chargeLe = m.date
            }
            await recharger()
        }
        .onChange(of: phase) { _, p in
            guard p == .active, let chargeLe, Date.now.timeIntervalSince(chargeLe) > 120 else { return }
            Task { await recharger() }
        }
    }

    private func recharger() async {
        let cleDemandee = cleMemoire
        do {
            let v = try await charger(session.api)
            try Task.checkCancellation()
            session.memoire[cleDemandee] = (v, .now)
            chargeLe = .now
            withAnimation(.smooth) { valeur = v; erreur = nil; avertissement = nil }
        } catch is CancellationError {
        } catch let e as URLError where e.code == .cancelled {
        } catch {
            session.signaler(error)
            if valeur == nil {
                erreur = error.localizedDescription
            } else {
                let horsLigne = (error as? ErreurAPI)?.statut == 0
                withAnimation(.smooth) {
                    avertissement = horsLigne ? "Hors ligne : dernière version affichée" : error.localizedDescription
                }
            }
        }
    }
}
