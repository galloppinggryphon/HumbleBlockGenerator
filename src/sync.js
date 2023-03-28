'use strict'

import fs from 'fs'
import nodePath from 'path'
import chalk from 'chalk'
import { niceRelPath } from './lib/fs-utils.js'
import { log, resolveTemplateStrings } from './lib/utils.js'
import appData from './app-data.js'
import { fsWatcher } from './lib/fs-watcher.js'

export function runSync() {
	log( chalk.cyan( '≣≣≣≣≣≣≣≣≣≣≣≣≣≣ SYNCING FILES ≣≣≣≣≣≣≣≣≣≣≣≣≣≣\n' ) )

	log( 'SYNC DISABLED!' )
	return

	const { outputDir, settings } = appData
	const { sync } = settings
	const { BPDirName, RPDirName, minecraftPath } = sync

	const paths = getPaths( { outputDir, BPDirName, RPDirName, minecraftPath } )

	if ( ! paths ) {
		return
	}

	log( 'Minecraft location:\n', chalk.magentaBright( paths.game ), '\n' )
	log( chalk.green( '[BP]' ), chalk.cyan( '⇛ ' ), niceRelPath( paths.remoteBP, paths.game ) )
	log( chalk.yellow( '[RP]' ), chalk.cyan( '⇛ ' ), niceRelPath( paths.remoteRP, paths.game ) )

	log()

	fsWatcher( {
		config: {
			runOnce: true,
			waitMsg: `${ chalk.redBright( '\nDone.' ) }`,
			waitMsgDelay: 100,
		},
		locations: [
			{
				name: chalk.green( '[BP]' ),
				source: paths.localBP,
				destination: paths.remoteBP,
			},
			{
				name: chalk.yellow( '[RP]' ),
				source: paths.localRP,
				destination: paths.remoteRP,
			},
		],
		ignoreFiles: settings.ignoreFiles,
	} )
}

function getPaths( { outputDir, BPDirName, RPDirName } ) {
	const minecraftPath = nodePath.resolve( 'TEST' )

	const localBP = nodePath.resolve( outputDir, 'BP' )// relative to root
	const localRP = nodePath.resolve( outputDir, 'RP' )

	const gamePath = nodePath.resolve( resolveTemplateStrings( minecraftPath, process.env ) )
	const remoteBP = nodePath.join( gamePath, 'development_behavior_packs', BPDirName )
	const remoteRP = nodePath.join( gamePath, 'development_resource_packs', RPDirName )

	if ( ! fs.existsSync( gamePath ) ) {
		console.error( '⛔ Minecraft not found at given path:', gamePath )
		return
	}
	if ( ! fs.existsSync( localBP ) ) {
		console.error( '⛔ Source not found:', localBP )
		return
	}
	if ( ! fs.existsSync( localRP ) ) {
		console.error( '⛔ Source not found:', localRP )
		return
	}

	if ( ! fs.existsSync( remoteBP ) ) {
		fs.mkdirSync( remoteBP, { recursive: true } )
	}

	if ( ! fs.existsSync( remoteRP ) ) {
		fs.mkdirSync( remoteRP, { recursive: true } )
	}

	return { game: gamePath, localBP, remoteBP, localRP, remoteRP }
}
