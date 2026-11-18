// Dock tile plugin: macOS loads this into the Dock so Nematode's pinned Dock icon can follow the
// icon picked in the menu bar, without restarting the Dock. The app saves the choice in its
// preferences ("icon" in com.nematode.app) and posts com.nematode.app.iconChanged; we redraw.
import AppKit

@objc(NematodeDockTilePlugin)
final class NematodeDockTilePlugin: NSObject, NSDockTilePlugIn {
    private var observer: NSObjectProtocol?

    func setDockTile(_ dockTile: NSDockTile?) {
        if let observer { DistributedNotificationCenter.default().removeObserver(observer) }
        observer = nil
        guard let dockTile else { return } // removed from the Dock
        observer = DistributedNotificationCenter.default().addObserver(
            forName: Notification.Name("com.nematode.app.iconChanged"), object: nil, queue: .main
        ) { [weak self] _ in self?.draw(on: dockTile) }
        draw(on: dockTile)
    }

    private func draw(on tile: NSDockTile) {
        let domain = "com.nematode.app" as CFString
        CFPreferencesAppSynchronize(domain)
        let id = CFPreferencesCopyAppValue("icon" as CFString, domain) as? String ?? "pinkblue"
        guard let url = Bundle(for: Self.self).url(forResource: id, withExtension: "png"),
              let image = NSImage(contentsOf: url) else {
            tile.contentView = nil // unknown choice: fall back to the app's own icon
            tile.display()
            return
        }
        let view = NSImageView(frame: NSRect(origin: .zero, size: tile.size))
        view.image = image
        view.imageScaling = .scaleProportionallyUpOrDown
        tile.contentView = view
        tile.display()
    }
}
