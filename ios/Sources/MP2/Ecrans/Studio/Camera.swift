import AVFoundation
import CoreImage
import MetalKit
import SwiftUI

/*
 * Caméra du studio. Les images passent par AVCaptureVideoDataOutput :
 *  - l'aperçu les affiche avec le filtre choisi (Metal + Core Image) ;
 *  - pendant un clip, AVAssetWriter les écrit telles quelles en MP4
 *    H.264 720×1280 à 2,5 Mbit/s (AAC mono) : 3 minutes tiennent sous la
 *    limite d'envoi de 90 Mo. Le filtre n'est pas gravé : il va dans le
 *    montage et le serveur l'applique au rendu, comme sur le site.
 *  - une lentille active, elle, est dessinée dans l'image écrite.
 * La caméra avant filme en miroir, telle qu'on se voit : les textes des
 * lentilles se lisent dans le bon sens à l'aperçu comme dans la vidéo.
 */
final class Camera: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate,
                    AVCaptureAudioDataOutputSampleBufferDelegate, @unchecked Sendable {
    let session = AVCaptureSession()
    let apercu = DerniereImage()
    let lentilles = MoteurLentilles()
    private let rendu = CIContext(options: [.workingColorSpace: NSNull()])
    private var adaptateur: AVAssetWriterInputPixelBufferAdaptor?
    private let file = DispatchQueue(label: "mp2.camera", qos: .userInitiated)
    private let sortieVideo = AVCaptureVideoDataOutput()
    private let sortieAudio = AVCaptureAudioDataOutput()
    private var entreeVideo: AVCaptureDeviceInput?

    // Accédés seulement sur `file`.
    private var redacteur: AVAssetWriter?
    private var pisteVideo: AVAssetWriterInput?
    private var pisteAudio: AVAssetWriterInput?
    private var debut: CMTime?
    private var derniere: CMTime = .zero
    private var enregistre = false
    private var url: URL?

    /// Durée du clip en cours, sur le fil principal.
    var surDuree: (@MainActor (Double) -> Void)?
    private(set) var avant = true

    enum ErreurCamera: LocalizedError {
        case refus, indisponible
        var errorDescription: String? {
            switch self {
            case .refus: "Autorise la caméra et le micro dans Réglages > mp2ifsm pour filmer."
            case .indisponible: "La caméra n’est pas disponible sur cet appareil."
            }
        }
    }

    func configurer() async throws {
        guard await AVCaptureDevice.requestAccess(for: .video),
              await AVCaptureDevice.requestAccess(for: .audio) else { throw ErreurCamera.refus }
        try await withCheckedThrowingContinuation { (suite: CheckedContinuation<Void, Error>) in
            file.async {
                do { try self.monter(); suite.resume() } catch { suite.resume(throwing: error) }
            }
        }
    }

    private func monter() throws {
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        session.sessionPreset = .hd1280x720
        guard let camera = Self.appareil(avant: avant),
              let entree = try? AVCaptureDeviceInput(device: camera), session.canAddInput(entree) else {
            throw ErreurCamera.indisponible
        }
        session.addInput(entree)
        entreeVideo = entree
        if let micro = AVCaptureDevice.default(for: .audio), let e = try? AVCaptureDeviceInput(device: micro),
           session.canAddInput(e) { session.addInput(e) }

        sortieVideo.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        sortieVideo.alwaysDiscardsLateVideoFrames = true
        sortieVideo.setSampleBufferDelegate(self, queue: file)
        if session.canAddOutput(sortieVideo) { session.addOutput(sortieVideo) }
        sortieAudio.setSampleBufferDelegate(self, queue: file)
        if session.canAddOutput(sortieAudio) { session.addOutput(sortieAudio) }
        orienter()
    }

    /// Images en portrait ; en miroir pour la caméra avant.
    private func orienter() {
        guard let c = sortieVideo.connection(with: .video) else { return }
        if c.isVideoRotationAngleSupported(90) { c.videoRotationAngle = 90 }
        if c.isVideoMirroringSupported { c.automaticallyAdjustsVideoMirroring = false; c.isVideoMirrored = avant }
    }

    private static func appareil(avant: Bool) -> AVCaptureDevice? {
        AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: avant ? .front : .back)
    }

    func demarrer() { file.async { if !self.session.isRunning { self.session.startRunning() } } }
    func arreter() { file.async { if self.session.isRunning { self.session.stopRunning() } } }

    /// Change de caméra (entre deux clips seulement).
    func basculer() {
        file.async {
            guard !self.enregistre, let ancienne = self.entreeVideo,
                  let camera = Self.appareil(avant: !self.avant),
                  let nouvelle = try? AVCaptureDeviceInput(device: camera) else { return }
            self.session.beginConfiguration()
            self.session.removeInput(ancienne)
            if self.session.canAddInput(nouvelle) {
                self.session.addInput(nouvelle)
                self.entreeVideo = nouvelle
                self.avant.toggle()          // avant orienter() : le miroir suit la caméra
            } else {
                self.session.addInput(ancienne)
            }
            self.orienter()
            self.session.commitConfiguration()
        }
    }

    // MARK: Enregistrement

    func commencer() {
        file.async {
            let url = FileManager.default.temporaryDirectory.appending(path: "clip-\(UUID().uuidString).mp4")
            guard let w = try? AVAssetWriter(outputURL: url, fileType: .mp4) else { return }
            let video = AVAssetWriterInput(mediaType: .video, outputSettings: [
                AVVideoCodecKey: AVVideoCodecType.h264,
                AVVideoWidthKey: 720,
                AVVideoHeightKey: 1280,
                AVVideoCompressionPropertiesKey: [
                    AVVideoAverageBitRateKey: 2_500_000,
                    AVVideoMaxKeyFrameIntervalKey: 60,
                    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                ],
            ])
            video.expectsMediaDataInRealTime = true
            let audio = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC, AVNumberOfChannelsKey: 1,
                AVSampleRateKey: 44_100, AVEncoderBitRateKey: 96_000,
            ])
            audio.expectsMediaDataInRealTime = true
            if w.canAdd(video) { w.add(video) }
            if w.canAdd(audio) { w.add(audio) }
            // Images dessinées (lentille) : tampons de l'enregistreur, rendus par Core Image.
            self.adaptateur = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: video, sourcePixelBufferAttributes: [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                kCVPixelBufferWidthKey as String: 720, kCVPixelBufferHeightKey as String: 1280,
            ])
            self.redacteur = w
            self.pisteVideo = video
            self.pisteAudio = audio
            self.debut = nil
            self.url = url
            self.enregistre = true
        }
    }

    /// Termine le clip ; renvoie son fichier et sa durée (nil s'il est vide).
    func finir() async -> (URL, Double)? {
        await withCheckedContinuation { (suite: CheckedContinuation<(URL, Double)?, Never>) in
            file.async {
                self.enregistre = false
                guard let w = self.redacteur, let url = self.url, let debut = self.debut,
                      w.status == .writing else {
                    self.redacteur?.cancelWriting()
                    self.redacteur = nil
                    suite.resume(returning: nil)
                    return
                }
                let duree = (self.derniere - debut).seconds
                self.pisteVideo?.markAsFinished()
                self.pisteAudio?.markAsFinished()
                w.finishWriting {
                    self.redacteur = nil
                    suite.resume(returning: w.status == .completed && duree > 0.2 ? (url, duree) : nil)
                }
            }
        }
    }

    func captureOutput(_ sortie: AVCaptureOutput, didOutput tampon: CMSampleBuffer, from connexion: AVCaptureConnection) {
        let instant = CMSampleBufferGetPresentationTimeStamp(tampon)
        if sortie === sortieVideo {
            guard let pixels = CMSampleBufferGetImageBuffer(tampon) else { return }
            let brute = CIImage(cvPixelBuffer: pixels)
            let traitee = lentilles.traiter(brute, tampon: pixels, instant: instant)
            apercu.poser(traitee ?? brute)
            guard enregistre, let w = redacteur else { return }
            if w.status == .unknown {
                w.startWriting()
                w.startSession(atSourceTime: instant)
                debut = instant
            }
            if w.status == .writing, let v = pisteVideo, v.isReadyForMoreMediaData {
                if let traitee {
                    guard let pool = adaptateur?.pixelBufferPool else { return }
                    var sortie: CVPixelBuffer?
                    CVPixelBufferPoolCreatePixelBuffer(nil, pool, &sortie)
                    guard let sortie else { return }
                    rendu.render(traitee, to: sortie, bounds: CGRect(x: 0, y: 0, width: 720, height: 1280),
                                 colorSpace: CGColorSpaceCreateDeviceRGB())
                    adaptateur?.append(sortie, withPresentationTime: instant)
                } else {
                    v.append(tampon)
                }
                derniere = instant
                if let debut, let rappel = surDuree {
                    let d = (instant - debut).seconds
                    Task { @MainActor in rappel(d) }
                }
            }
        } else if enregistre, debut != nil, let w = redacteur, w.status == .writing,
                  let a = pisteAudio, a.isReadyForMoreMediaData {
            a.append(tampon)
        }
    }
}

/// Dernière image de la caméra, partagée entre la file de capture et l'affichage.
final class DerniereImage: @unchecked Sendable {
    private let verrou = NSLock()
    private var image: CIImage?
    func poser(_ i: CIImage) { verrou.lock(); image = i; verrou.unlock() }
    func lire() -> CIImage? { verrou.lock(); defer { verrou.unlock() }; return image }
}

/// Aperçu filtré en direct : Metal + Core Image, image remplissant l'écran.
struct ApercuCamera: UIViewRepresentable {
    let source: DerniereImage
    let filtre: FiltreVideo

    func makeCoordinator() -> Rendu { Rendu(source: source) }

    func makeUIView(context: Context) -> MTKView {
        let v = MTKView(frame: .zero, device: context.coordinator.appareil)
        v.framebufferOnly = false
        v.preferredFramesPerSecond = 30
        v.colorPixelFormat = .bgra8Unorm
        v.delegate = context.coordinator
        v.backgroundColor = .black
        return v
    }

    func updateUIView(_ v: MTKView, context: Context) {
        context.coordinator.filtre = filtre
    }

    final class Rendu: NSObject, MTKViewDelegate {
        let appareil = MTLCreateSystemDefaultDevice()
        private lazy var file = appareil?.makeCommandQueue()
        // Sans gestion des couleurs : les filtres agissent sur les valeurs sRGB, comme en CSS.
        private lazy var contexte = appareil.map { CIContext(mtlDevice: $0, options: [.workingColorSpace: NSNull()]) }
        let source: DerniereImage
        var filtre = FiltreVideo.tous[0]

        init(source: DerniereImage) { self.source = source }

        func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

        func draw(in view: MTKView) {
            guard let brute = source.lire(), let drawable = view.currentDrawable,
                  let contexte, let commandes = file?.makeCommandBuffer() else { return }
            var image = filtre.appliquer(brute)
            let cible = view.drawableSize
            let echelle = max(cible.width / image.extent.width, cible.height / image.extent.height)
            image = image.transformed(by: CGAffineTransform(scaleX: echelle, y: echelle))
            image = image.transformed(by: CGAffineTransform(
                translationX: (cible.width - image.extent.width) / 2 - image.extent.minX,
                y: (cible.height - image.extent.height) / 2 - image.extent.minY))
            contexte.render(image, to: drawable.texture, commandBuffer: commandes,
                            bounds: CGRect(origin: .zero, size: cible), colorSpace: CGColorSpaceCreateDeviceRGB())
            commandes.present(drawable)
            commandes.commit()
        }
    }
}
