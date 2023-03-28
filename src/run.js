'use strict'
import { promises as fsAsync } from 'fs'
import nodePath from 'path'
import chalk from 'chalk'

import { pathExists } from './lib/fs-utils.js'
import { getScriptArgs } from './lib/get-args.js'
import { runSync } from './sync.js'
import appData, { initAppData } from './app-data.js'
import display, { log } from './lib/display.js'
import runBuilder from './builder/index.js'

// import { runUpdateSchemas } from './update.js'\

async function main() {
	printTitle()

	if ( ! await initAppData() ) {
		return
	}

	const _scriptArgs = getScriptArgs()
	const { build, init, sync, ...scriptArgs } = _scriptArgs
	appData.scriptArgs = scriptArgs

	if ( init ) {
		install()
		return
	}

	if ( build === 'models' ) {
		display.header( ' PROCEDURAL MODEL GENERATOR ' )
		runBuilder( { createModels: true, createBlocks: false } )
		return
	}

	if ( build === '' || build === 'blocks' ) {
		display.header( ' GENERATING BLOCKS ' )
		runBuilder( { createBlocks: true } )
		return
	}

	if ( sync ) {
		runSync()
		return
	}

	// if ( updateSchemas ) {
	// 	runUpdateSchemas()
	// 	return
	// }

	if ( scriptArgs && Object.keys( scriptArgs ).length ) {
		log( '\n⛔ ERROR! Invalid script argument(s): ', scriptArgs.join( ', ' ), '\n' )
	}

	showHelp()
}

async function install() {
	const { paths } = appData

	const sourceFolder = paths.templatePath

	const initFiles = {
		'config.js': 'config.js',
		'scaffolding.json': 'scaffolding.json',
		'blocks-vslab.json': 'blocks-vslab.json',
		'presets.json': 'presets.json',
	}

	log( '\n▒▒▒▒▒▒▒▒▒▒▒▒▒▒  🚩 Initializing Humble Block Generator 🚩  ▒▒▒▒▒▒▒▒▒▒▒▒▒▒' )
	log( '\nCreating default configuration files:\n' )

	if ( ! pathExists( sourceFolder ) ) {
		log( `⛔ FATAL ERROR: Configuration template folder (${ sourceFolder }) is missing!` )
		log( 'If this error is occurring during the initial installation of HUB, try again.' )
		log( `If this error occurred during a re-initialization, run 'npm install' to redownload the missing files.` )
		complete( false )
		return
	}

	const result = await copyFiles( Object.entries( initFiles ) )
	complete( result )

	function complete( success ) {
		log( '\n' )
		log( '┌────────────────────────────────────────┐' )
		log( '│                                        │' )

		if ( success ) {
			log( '│   🏆 HUB installed and initialized!    │' )
			log( `│   🛵 To continue, run ▶ 'npm start'.   │` )
		}
		else {
			log( '│   ⛔ INSTALL FAILED!                    │' )
		}
		log( '│                                        │' )
		log( '└────────────────────────────────────────┘' )

		log( '\nNPM install report below ↴ ↴ ↴\n' )
	}
}

async function copyFiles( files ) {
	if ( ! files || ! files.length ) {
		return
	}

	const [ destinationFile, sourceFile ] = files.shift()
	const { rootPath, templatePath: source, configPath } = appData.paths

	const destination = nodePath.join( rootPath, destinationFile )

	if ( pathExists( destination ) ) {
		log( `${ sourceFile }   [🟡 SKIPPED]   File already exists` )
	}
	else if ( ! pathExists( source ) ) {
		log( `${ sourceFile }   [❌ ERROR]   Cannot find source` )
	}
	else {
		let fsOpResult
		try {
			fsOpResult = await fsAsync.mkdir( nodePath.dirname( destination ), { recursive: true } )
			fsOpResult = await fsAsync.copyFile( source, destination )
		}
		catch ( err ) {
			log( 'A failure occurred while copying files.\n\nError details:' )
			log( err.message )
			return false
		}

		if ( fsOpResult ) {
			log( `${ sourceFile }   [❌ ERROR]   Unknown error ==> `, fsOpResult )
		}
		else {
			log( `${ sourceFile }   [🟢 SUCCESS]   File created` )
		}
	}

	return true
}

function showHelp() {
	log( '\nUSAGE' )
	log( 'npm start\t\t   :: Show help' )
	log( 'npm run build\t\t   :: Generate blocks' )
	log( 'npm run build [arguments]  :: Advanced syntax (see below)' )
	log( 'npm run init\t\t   :: Regenerate initial configuration files' )

	log( '\nADVANCED USAGE' )
	log( 'npm run build [blocks:file.json,[...]] [outputDir:relative/output/path]' )
	log( '\nArguments: ' )
	log( 'blocks\t\t:: Specify block template files' )
	log( 'outputDir\t:: Write output to a different folder, relative to root' )
	log( '\nPath names containing spaces must be quoted.' )
	log( '\nFor more information, see readme.md.' )
}

function printTitle() {
	const Y = chalk.yellow
	const bgY = chalk.bgYellow
	const G = chalk.green
	const bgG = chalk.bgGreen
	const R = chalk.red
	const bgR = chalk.bgRed
	const B = chalk.blue
	const bgB = chalk.bgBlue
	const BD = chalk.bold

	// ▥▦▮▬■≡≣⊞
	const L1 = G( '▮' )
	const L2 = Y( '▮' )
	const L3 = B( '▮' )

	log( '══════════════════════════════════════════════════════════' )

	// eslint-disable-next-line prefer-template
	log( L1, ' ', L1, ' ' + G( BD( ' HUMBLE              ' ) ) )

	// eslint-disable-next-line prefer-template
	log( L2, L2, L2, ' ' + Y( BD( ' BLOCK               ' ) ) )

	// eslint-disable-next-line prefer-template
	log( L3, ' ', L3, ' ' + B( BD( ' GENERATOR           ' ) ) )

	log( '══════════════════════════════════════════════════════════' )
}

main()
