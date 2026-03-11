fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'arderumapbuilder'
author 'Arderu'
description 'Standalone FiveM map builder (Lua rewrite)'
version '2.0.0'

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/panel.js',
    'html/objects.js',
    'html/kategoriler.json',
    'html/icons/*.svg'
}

shared_script 'shared.lua'

client_scripts {
    'gizmo_dataview.lua',
    'client.lua'
}

server_script 'server.lua'
