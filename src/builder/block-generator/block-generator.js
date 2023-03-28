'use strict'
import chalk from 'chalk'
import {
	getBlockFileInfo,
} from './generator-utils.js'
import {
	logger,
} from '../generator-config.js'
import appData from '../../app-data.js'
import BlockParser from './parsers/block-parser.js'
import display, { log } from '../../lib/display.js'
import { saveDataToJson } from '../../lib/json-utils.js'

export default function generateBlocks( { fileName, blockData, results } ) {
	// ~ Run blockGenerator on each root category ~
	// Note: generator requires 'for of', can't use forEach or map
	/** @type {GeneratedBlockData} */
	let block
	for ( block of BlockGenerator( { fileName, blockData } ) ) {
		const { identifier, permutationData, title, block: data } = block
		const fileInfo = getBlockFileInfo( permutationData.path )

		// Log progress to screen
		log(
			chalk.white( identifier ),
			chalk.yellow( chalk.bold( ' ⇒  ' ) ),
			chalk.white( fileInfo.relPath ),
		) //  ▶  ▸▸▸ ►►► ⇒ ⋙

		// log( `${ identifier } ➡  ${ fileInfo.dynamicFileName }` )

		// ~ Save ~
		const result = saveDataToJson( fileInfo, data )

		results.blocks.push( result )
		result.then( ( e ) => {
			if ( e ) {
				logger.error( 'Failed to write block to JSON file.', e )
			}
		} )

		results.counter++

		// Store titles to save in text file when processing is done
		// tile.prefix:blockname.name=Block Title
		const { prefix } = appData.settings
		results.titles.push( `tile.${ prefix }:${ identifier }.name=${ title }` )
	}
}

/**
 * @param {Object} props
 * @param {string} props.fileName
 * @param {JSO} props.blockData
 * @param {string} [props.permutationKey]
 * @param {PermutationBuilder} [props.prevPermutation]
 * @yields {GeneratedBlockData}
 * return {GeneratedBlockData}
 */
function* BlockGenerator( {
	fileName,
	blockData,
	permutationKey = undefined,
	prevPermutation = undefined,
} ) {
	// ~ Process root ~
	// Run generator recursively on each root element
	// Initialize on first iteration
	// if ( permutationKey === undefined ) {
	// 	for ( const [ key, template ] of Object.entries( blockTemplate ) ) {
	// 		yield* BlockGenerator( {
	// 			fileName,
	// 			blockTemplate: template,
	// 			permutationKey: key,
	// 		} )
	// 	}
	// 	return
	// }

	// ~ Init ~
	// Each level inherits from -- but must not mutate -- its parent
	// if ( ! data ) {
	// 	logger.setSection( fileName )
	// 	data = PermutationBuilder( blockTemplate )
	// }
	// else {
	// 	data.newPermutation( blockTemplate, permutationKey )
	// }

	// data = data ?? PermutationBuilder( blockTemplate )
	// const permutation = data.newPermutation( permutationKey, blockTemplate )

	const permutation = prevPermutation
		? prevPermutation.newPermutation( permutationKey, blockData )
		: BlockParser( blockData )

	if ( ! permutation.isValid() ) {
		return
	}

	// ~ Recursively iterate through descendant variant/permutation branches ~
	if ( permutation.hasPermutations() ) {
		for ( const [ key, template ] of permutation.getPermutations() ) {
			yield* BlockGenerator( {
				fileName,
				blockData: template,
				permutationKey: key,
				prevPermutation: permutation,
			} )
		}
		return
	}

	// ~ Reached the deepest variant/permutation of this tree ~
	permutation.parseMaterials()

	for ( const materialPermutation of permutation.eachMaterialPermutation() ) {
		yield materialPermutation.createBlock()
	}
}
