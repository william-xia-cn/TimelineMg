import SwiftUI
import WidgetKit

private let snapshotSchema = "timewhere-widget-v1"
private let appGroupIdentifier = "group.cn.williamxia.timewhere"
private let snapshotFileName = "timewhere-widget-v1.json"

struct WidgetCounts: Codable {
    let completedToday: Int
    let pendingToday: Int

    enum CodingKeys: String, CodingKey {
        case completedToday = "completed_today"
        case pendingToday = "pending_today"
    }
}

struct WidgetTask: Codable, Identifiable {
    let id: String
    let title: String
    let planName: String
    let scheduleTime: String?
    let duration: Int
    let priority: String
    let progress: String
    let assignmentLabel: String

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case planName = "plan_name"
        case scheduleTime = "schedule_time"
        case duration
        case priority
        case progress
        case assignmentLabel = "assignment_label"
    }
}

struct WidgetSnapshot: Codable {
    let schema: String
    let generatedAt: String
    let counts: WidgetCounts
    let currentTasks: [WidgetTask]

    enum CodingKeys: String, CodingKey {
        case schema
        case generatedAt = "generated_at"
        case counts
        case currentTasks = "current_tasks"
    }

    static let empty = WidgetSnapshot(
        schema: snapshotSchema,
        generatedAt: "",
        counts: WidgetCounts(completedToday: 0, pendingToday: 0),
        currentTasks: []
    )
}

struct TimeWhereEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

struct TimeWhereProvider: TimelineProvider {
    func placeholder(in context: Context) -> TimeWhereEntry {
        TimeWhereEntry(date: Date(), snapshot: WidgetSnapshot.empty)
    }

    func getSnapshot(in context: Context, completion: @escaping (TimeWhereEntry) -> Void) {
        completion(TimeWhereEntry(date: Date(), snapshot: loadSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TimeWhereEntry>) -> Void) {
        let now = Date()
        let entry = TimeWhereEntry(date: now, snapshot: loadSnapshot())
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: now) ?? now.addingTimeInterval(900)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func loadSnapshot() -> WidgetSnapshot {
        let urls = snapshotCandidateURLs()
        for url in urls {
            guard let data = try? Data(contentsOf: url),
                  let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data),
                  snapshot.schema == snapshotSchema else {
                continue
            }
            return snapshot
        }
        return WidgetSnapshot.empty
    }

    private func snapshotCandidateURLs() -> [URL] {
        var urls: [URL] = []
        if let groupURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier) {
            urls.append(groupURL.appendingPathComponent(snapshotFileName))
        }
        if let supportURL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
            urls.append(supportURL.appendingPathComponent("TimeWhere").appendingPathComponent(snapshotFileName))
        }
        return urls
    }
}

struct TimeWhereWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TimeWhereProvider.Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            if family == .systemLarge {
                taskList(limit: 3)
            } else {
                taskList(limit: 1)
            }
            Spacer(minLength: 0)
        }
        .containerBackground(.fill.tertiary, for: .widget)
        .widgetURL(URL(string: "timewhere://dashboard"))
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 10) {
            Text("TimeWhere")
                .font(.headline)
                .lineLimit(1)
            Spacer()
            stat(title: "Done", value: entry.snapshot.counts.completedToday)
            stat(title: "Todo", value: entry.snapshot.counts.pendingToday)
        }
    }

    private func stat(title: String, value: Int) -> some View {
        VStack(spacing: 2) {
            Text("\(value)")
                .font(.headline)
                .monospacedDigit()
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(minWidth: 42)
    }

    private func taskList(limit: Int) -> some View {
        let tasks = Array(entry.snapshot.currentTasks.prefix(limit))
        return VStack(alignment: .leading, spacing: 8) {
            if tasks.isEmpty {
                Text("No current task")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(tasks) { task in
                    taskRow(task)
                }
            }
        }
    }

    private func taskRow(_ task: WidgetTask) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(task.title)
                .font(.subheadline)
                .fontWeight(.semibold)
                .lineLimit(2)
            HStack(spacing: 6) {
                if let scheduleTime = task.scheduleTime, !scheduleTime.isEmpty {
                    Text(scheduleTime)
                }
                if !task.planName.isEmpty {
                    Text(task.planName)
                }
                Text("\(task.duration)m")
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        .padding(8)
        .background(.background.opacity(0.45), in: RoundedRectangle(cornerRadius: 8))
    }
}

struct TimeWhereWidget: Widget {
    let kind = "TimeWhereWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TimeWhereProvider()) { entry in
            TimeWhereWidgetView(entry: entry)
        }
        .configurationDisplayName("TimeWhere")
        .description("Current tasks and today's task counts.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

@main
struct TimeWhereWidgetBundle: WidgetBundle {
    var body: some Widget {
        TimeWhereWidget()
    }
}
