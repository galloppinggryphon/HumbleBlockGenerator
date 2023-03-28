'use strict'
import nodePath from 'path'
import { existsSync } from 'fs'
import chalk from 'chalk'

import appData from '../../app-data.js'

import { log } from '../../lib/display.js'
import { loadJsonFiles, saveDataToJson } from '../../lib/json-utils.js'
import { createModelName, ModelFactory, ModelGenerator } from './model-generator.js'

export async function runModelGenerator() {
	const { settings } = appData
	const { configPath } = appData.paths
	const { modelConfig, modelFileDir } = settings.input

	const modelConfigPath = nodePath.resolve( configPath, modelConfig )
	const modelInputPath = nodePath.resolve( configPath, modelFileDir )
	const modelConfigData = loadJsonFiles( modelConfigPath )

	const stats = {
		models: 0,
		file_errors: 0,
		model_errors: [],
	}

	for ( const [ category, categoryData ] of Object.entries( modelConfigData ) ) {
		for ( const categoryItem of categoryData ) {
			if ( categoryItem.variants ) {
				for ( const variantData of categoryItem.variants ) {
					const variant = { ...variantData, ...categoryItem }
					await parseModelFile( category, modelInputPath, stats, variant )
				}
			}
			else {
				await parseModelFile( category, modelInputPath, stats, categoryItem )
			}
		}
	}

	log( '\n', chalk.bgGreen.bold( ' MODEL GENERATOR DONE! ' ), '\n' )
	log( '-------------------------------------------\n' )
	log( chalk.cyan( chalk.bold( `\nModels created:\t${ stats.models }` ) ),
		`\nModels errors:\t${ stats.model_errors.length }`,
		`\nFile errors:\t${ stats.file_errors }`,
	)
	log( '-------------------------------------------\n' )

	if ( stats.file_errors ) {
		log( chalk.red( `Warning - some files are missing or could not be read!\n` ) )

		// log(`\n\nCreated ${ stats.models - stats.failed } models.`,)
	}

	log()

	// if ( stats.failed ) {
	// 	log( chalk.red( `Warning - ${ stats.models - stats.failed } files are missing!` ) )
	// 	log()

	// }
}

async function parseModelFile( category, modelInputPath, stats, { file, name, models, export_base, templates } ) {
	const filePath = `${ nodePath.join( modelInputPath, file ) }.json`

	log()
	log()

	log( chalk.yellow( `[${ file }]` ) )

	if ( ! existsSync( filePath ) ) {
		stats.file_errors++
		log( chalk.red( 'ERROR!' ), 'File not found!' )
		return
	}

	// Read file
	const modelData = loadJsonFiles( filePath )

	if ( ! modelData ) {
		stats.file_errors++
		log( chalk.red( 'ERROR!' ), 'File could not be read!' )
		return
	}

	try {
		// Export the whole model file?
		if ( export_base || ! models ) {
			const modelJson = modelData
			modelJson[ 'minecraft:geometry' ][ 0 ].description.identifier = createModelName( name )

			const result = await saveModelJson( { category, name, modelJson } )

			if ( result && ! result.error ) {
				stats.models++
			}
		}

		// Generate models from combinations of bones
		if ( models ) {
			const modelFactory = ModelFactory( modelData, name )

			for ( const { modelName, bones } of ModelGenerator( { modelData: models, templates } ) ) {
				const modelJson = modelFactory( modelName, bones )
				const result = await saveModelJson( { category, name, modelName, modelJson } )

				if ( ! result ) {
					stats.models++
				}
			}
		}
	}
	catch ( err ) {
		log( chalk.red( 'ERROR!' ), err.message )
		stats.model_errors.push( false )
	}
}

function saveModelJson( { category, name, modelName = '', modelJson } ) {
	const { paths } = appData.generatorData.output
	const modelOutputPath = nodePath.join( paths.RP, '/models/blocks/hubgen/', category )

	const fileInfo = {
		path: modelOutputPath,
		fileName: `${ name + modelName }.geo.json`,
	}

	log( '→', name + modelName )
	return saveDataToJson( fileInfo, modelJson )
}
