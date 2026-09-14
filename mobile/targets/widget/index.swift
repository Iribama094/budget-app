import SwiftUI
import WidgetKit

// Must match APP_GROUP in src/lib/widgetData.ts and ios.entitlements in app.json.
private let appGroup = "group.com.budgetfriendly.app"

struct SafeToSpendEntry: TimelineEntry {
  let date: Date
  let status: String
  let safeToday: String
  let left: String
  let daysLeft: Int
  let label: String

  var hasBudget: Bool { status != "none" }

  static let sample = SafeToSpendEntry(date: Date(), status: "onPace", safeToday: "₦14,640", left: "₦263,600", daysLeft: 18, label: "September 2026")
  static let empty = SafeToSpendEntry(date: Date(), status: "none", safeToday: "", left: "", daysLeft: 0, label: "")
}

struct SafeToSpendProvider: TimelineProvider {
  func placeholder(in context: Context) -> SafeToSpendEntry { .sample }

  func getSnapshot(in context: Context, completion: @escaping (SafeToSpendEntry) -> Void) {
    completion(context.isPreview ? .sample : (load() ?? .sample))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<SafeToSpendEntry>) -> Void) {
    let entry = load() ?? .empty
    // The app reloads the widget whenever Home changes; this is only a fallback refresh.
    let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date().addingTimeInterval(3600)
    completion(Timeline(entries: [entry], policy: .after(next)))
  }

  private func load() -> SafeToSpendEntry? {
    guard let dict = UserDefaults(suiteName: appGroup)?.dictionary(forKey: "safeToSpend") else { return nil }
    let days = (dict["daysLeft"] as? NSNumber)?.intValue ?? Int(dict["daysLeft"] as? String ?? "") ?? 0
    return SafeToSpendEntry(
      date: Date(),
      status: dict["status"] as? String ?? "none",
      safeToday: dict["safeToday"] as? String ?? "",
      left: dict["left"] as? String ?? "",
      daysLeft: days,
      label: dict["label"] as? String ?? ""
    )
  }
}

struct SafeToSpendView: View {
  var entry: SafeToSpendEntry

  private let muted = Color(red: 0.66, green: 0.79, blue: 0.75)

  private var statusLabel: String {
    switch entry.status {
    case "over": return "Over budget"
    case "hot": return "Spending fast"
    default: return "On pace"
    }
  }

  private var statusColor: Color {
    switch entry.status {
    case "over": return Color(red: 0.94, green: 0.46, blue: 0.40)
    case "hot": return Color(red: 0.89, green: 0.71, blue: 0.36)
    default: return Color(red: 0.56, green: 0.84, blue: 0.76)
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(entry.hasBudget ? (entry.status == "over" ? "OVER BUDGET BY" : "SAFE TO SPEND TODAY") : "BUDGETFRIENDLY")
        .font(.system(size: 10, weight: .semibold))
        .foregroundColor(muted)

      if entry.hasBudget {
        Text(entry.safeToday)
          .font(.system(size: 28, weight: .semibold, design: .rounded))
          .foregroundColor(.white)
          .minimumScaleFactor(0.6)
          .lineLimit(1)
        Text("\(entry.left) left · \(entry.daysLeft) days")
          .font(.system(size: 11))
          .foregroundColor(.white.opacity(0.75))
          .lineLimit(1)
        Spacer(minLength: 0)
        Text(statusLabel)
          .font(.system(size: 11, weight: .semibold))
          .padding(.horizontal, 8)
          .padding(.vertical, 3)
          .background(statusColor.opacity(0.18))
          .foregroundColor(statusColor)
          .clipShape(Capsule())
      } else {
        Text("Set a budget to see what’s safe to spend each day.")
          .font(.system(size: 13, weight: .medium))
          .foregroundColor(.white)
        Spacer(minLength: 0)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .containerBackground(for: .widget) {
      Color("$widgetBackground")
    }
  }
}

@main
struct SafeToSpendWidget: Widget {
  let kind = "SafeToSpend"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: SafeToSpendProvider()) { entry in
      SafeToSpendView(entry: entry)
    }
    .configurationDisplayName("Safe to spend")
    .description("What you can spend today and how your budget is pacing.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}
