import Foundation

/// Tout s'affiche à l'heure de Paris et en français, quel que soit le réglage du téléphone.
enum Paris {
    static let fuseau = TimeZone(identifier: "Europe/Paris")!
    static let langue = Locale(identifier: "fr_FR")
    static let calendrier: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = fuseau
        c.locale = langue
        c.firstWeekday = 2
        return c
    }()

    static func style(_ s: Date.FormatStyle) -> Date.FormatStyle {
        var s = s
        s.timeZone = fuseau
        s.locale = langue
        s.calendar = calendrier
        return s
    }

    // MARK: Jours "AAAA-MM-JJ" (format des semaines du colloscope)

    static func date(_ jour: String) -> Date? {
        let p = jour.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        return calendrier.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: 12))
    }

    static func jour(_ d: Date) -> String {
        let c = calendrier.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    static func ajouter(_ n: Int, joursA jour: String) -> String {
        guard let d = date(jour), let r = calendrier.date(byAdding: .day, value: n, to: d) else { return jour }
        return self.jour(r)
    }
}

extension Date {
    /// « 08:00 »
    var heure: String { formatted(Paris.style(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))) }

    /// « lun. 10 nov. »
    var jourCourt: String { formatted(Paris.style(.dateTime.weekday(.abbreviated).day().month(.abbreviated))) }

    /// « aujourd’hui », « demain », « jeudi », puis « lun. 17 » au-delà d'une semaine (comme le site).
    var jourRelatif: String {
        let cal = Paris.calendrier
        let ecart = cal.dateComponents([.day], from: cal.startOfDay(for: .now), to: cal.startOfDay(for: self)).day ?? 0
        switch ecart {
        case 0: return "aujourd’hui"
        case 1: return "demain"
        case 2..<7: return formatted(Paris.style(.dateTime.weekday(.wide)))
        default: return formatted(Paris.style(.dateTime.weekday(.abbreviated).day()))
        }
    }

    /// « dans 3 jours », « dans 2 heures »
    var dansCombienDeTemps: String {
        let f = RelativeDateTimeFormatter()
        f.locale = Paris.langue
        f.unitsStyle = .full
        return f.localizedString(for: self, relativeTo: .now)
    }
}

enum Montant {
    /// Centièmes de pricoupenkoin → « 12,34 PCK ».
    static func pck(_ centimes: Int) -> String {
        let valeur = Decimal(centimes) / 100
        return valeur.formatted(.number.precision(.fractionLength(2)).locale(Paris.langue)) + " PCK"
    }

    static func octets(_ n: Int) -> String {
        Int64(n).formatted(.byteCount(style: .file).locale(Paris.langue))
    }
}
