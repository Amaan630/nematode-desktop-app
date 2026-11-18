# dmgbuild settings for the install window: small, app on the left, Applications on the right,
# arrow and one line of instructions in the background. Run by scripts/build-mac.sh.
app = defines['app']  # noqa: F821 (provided by dmgbuild)
format = 'UDZO'
files = [app]
symlinks = {'Applications': '/Applications'}
background = 'build/dmg-background.tiff'  # 540x380 @1x and @2x, from scripts/dmg-background.html
window_rect = ((200, 140), (540, 380))
default_view = 'icon-view'
show_status_bar = show_tab_view = show_toolbar = show_pathbar = show_sidebar = False
icon_size = 112
text_size = 13
icon_locations = {'Nematode.app': (140, 170), 'Applications': (400, 170)}
