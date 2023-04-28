'use strict'
import _ from 'lodash'

import { filterPropsByKeyPrefix, mergeProps } from '../../builder-utils.js'
import appData from '../../../app-data.js'
import {
	isObj,
	log,
	hasKeysAny, reducer,
} from '../../../lib/utils.js'

import {
	logger, materialDirectives,
} from '../../generator-config.js'

/**
 * @param {PermutationBuilder} block
 * @param {MaterialBuilderData} prevData
 * @return {MaterialBuilder}
 */
export function MaterialBuilder( block, prevData = undefined ) {
	const { materialConfig = {} } = appData.generatorData

	/**
	 * @type {MaterialBuilderData}
	 */
	const data = prevData ?? {
		render: {},
		/**
		 * Base data.
		 */
		materialTemplates: materialConfig,

		/**
		 * Exports.
		 */
		materials: {},

		/**
		 * Temp data.
		 */
		materialPermutations: {},
	}

	/**
	 *
	 * @param {{key: string, material: MaterialTemplate}} props
	 */
	function newMaterialTemplate( { key = undefined, material } ) {
		// const materialInstance = {
		// 	texture: undefined,
		// }

		const { materialTemplates } = data

		// Create reference or create instance?
		if ( key in materialTemplates ) {
			return materialTemplates[ key ]
		}

		if ( typeof material === 'string' ) {
			materialTemplates[ key ] = {
				title: key,
				texture: material,
			}
		}
		else {
			materialTemplates[ key ] = { title: key, ...material }
		} // { ...materialInstance, ...this.render }
	}

	function newPermutationFromMaterial( name, materials ) {
		// Clone parser
		const permutation = block.copyPermutationData()
		permutation.setPermutationData( { key: name, type: 'material' } )

		// Create material_instances for the current permutation
		const { props } = permutation.data.block
		props.components.material_instances ??= {}
		mergeProps( props.components.material_instances, materials )

		block.data.materialPermutations.push( permutation )
		return permutation
	}

	/**
	 *
	 * param {string} permutationName
	 * @param {MaterialInstanceCollection|JSO<keyof MaterialInstance>} materialInstances
	 */
	function generateMaterialInstances( materialInstances ) {
		// const { materialInstances, materialTemplates } = data

		// const permutation = data.materialPermutations[ permutationName ]

		// if ( ! Object.keys( template ).includes( '*' ) ) {
		// 	logger.error( `Material permutation '${ permutationName }' is missing a default material instance (i.e. '*') in '${ block.data.currentPermutation.name }'.`, { materialInstanceConfig: template } )
		// }

		reducer( materialInstances, ( result, [ key, materialInstance ] ) => {
			// If the material is a string, interpret it as a reference and create master definition
			if ( typeof materialInstance === 'string' ) {
				if ( ! ( materialInstance in result ) ) {
					const template = data.materialTemplates[ materialInstance ]

					if ( ! template ) {
						result[ materialInstance ] = {
							texture: materialInstance,
						}
					}
					else {
						const { title, ...instanceProps } = template
						// Property optional mismatch
						result[ materialInstance ] = /** @type {any} */ ( instanceProps )
					}
				}
				result[ key ] = materialInstance
			}
			else {
				// @ts-ignore
				result[ key ] = materialInstance.texture

				const template = data.materialTemplates[ materialInstance.texture ]

				// Template not found
				// if ( ! template ) {
				// 	template = materialInstance
				// }

				const { title, ...instanceProps } = template ?? {}
				const { texture } = instanceProps

				// If the template exists and has not been added
				const material = texture && ! result[ texture ]
					? instanceProps
					: materialInstance

				if ( material?.texture ) {
					// @ts-ignore
					result[ texture ] = texture && ! result[ texture ]
						? instanceProps
						: materialInstance
				}
			}
			return result
		}, materialInstances )

		return materialInstances
	}

	/**
	 * Get the permutations that should be created, after running filters.
	 *
	 * @param {string[]} materials
	 * @param {string[]} excludeMaterials
	 */
	function getMaterialPermutations( materials, excludeMaterials, materialInstances ) {
		const permutations = _.cloneDeep( data.materialPermutations )

		// walk through permutations and filter their material instances
		return reducer( permutations, ( result, [ key, permutationData ] ) => {
			if ( ! permutationData ) {
				return result
			}

			const includeMaterial =
				( ! materials?.length && ! excludeMaterials?.length )
				|| ( materials?.length && materials.includes( key ) )
				|| ( excludeMaterials?.length && ! excludeMaterials.includes( key ) )

			if ( includeMaterial ) {
				result[ key ] = { title: permutationData.title }
				result[ key ].materialInstances = filterMaterialInstances( permutationData, materialInstances )
			}
			return result
		}, {} )
	}

	/**
	 * Filter '@material_permutations' with keys in '@material_instances'.
	 *
	 * @param {*} permutationData
	 * @param {*} materialInstances
	 */
	function filterMaterialInstances( permutationData, materialInstances ) {
		// Add default material instance: '*'
		const materialInstancesArray = [ ...new Set( [ '*', ...materialInstances ] ) ]

		const filteredMaterialInstances = materialInstances?.length ? {} : _.cloneDeep( permutationData.materialInstances )

		// Filter the material instances by name
		reducer( permutationData.materialInstances, ( filteredInstances, [ key, value ] ) => {
			if ( materialInstancesArray.includes( key ) ) {
				filteredInstances[ key ] = value
			}
			return filteredInstances
		}, filteredMaterialInstances )

		return filteredMaterialInstances
	}

	return {
		data,

		extractMaterials( templateData ) {
			if ( ! hasKeysAny( templateData.dir, ...materialDirectives ) ) {
				return
			}

			if ( templateData.dir.materials === null ) {
				return
			}

			const { material_permutations, material_templates } = templateData.dir

			// !disabled
			// if ( render ) {
			// 	materialBuilder.setRenderOptions( render )
			// }

			// ~ Add material templates ~
			// runs newMaterialTemplate() on all new templates
			if ( material_templates && Object.keys( material_templates ).length ) {
				Object.entries( material_templates ).forEach(
					( [ key, material ] ) => isObj( material ) && newMaterialTemplate( { key, material } ),
				)
			}

			// ~ Add material permutations ~
			// Add to data.materialPermutations
			if ( material_permutations && Object.keys( material_permutations ).length ) {
				// Add variables
				const extensions = filterPropsByKeyPrefix( material_permutations, '$' )

				reducer( material_permutations, ( result, [ key, permutation ] ) => {
					// Check that the template exists
					const { title } = data.materialTemplates[ key ] ?? {}
					if ( ! title ) {
						return result
					}

					const { extend, ...materialInstances } = permutation

					if ( extend && extensions[ extend ] ) {
						Object.assign( materialInstances, extensions[ extend ] )
					}

					result[ key ] = {
						title,
						materialInstances,
					}

					return result
				}, data.materialPermutations )

				// Resolve vars
				// resolveRefsRecursively( data.materialPermutations, vars, { mutateSource: true } )
			}

			// if ( material_permutations ) {
			// 	materialBuilder.addMaterialPermutations( material_permutations )
			// 	materialBuilder.filterMaterials( materials, material_instances )

			// 	// return materials.addMaterialPermutations( dir.material_permutations )
			// }

			// // Pre-process and merge @materials
			// if ( dir.materials ) {
			// 	data.block.dir.materials ??= {}

			// 	// // Check for string values, convert to object and map to *
			// 	// objReduce( dir.materials, ( result, [ key, value ] ) => {
			// 	// 	const material = typeof value === 'string'
			// 	// 		? { '*': value }
			// 	// 		: value

			// 	// 	result[ key ] = Object.assign( result[ key ] ?? {}, material )
			// 	// 	return result
			// 	// }, data.block.dir.materials )

			// 	delete dir.materials
			// }
		},

		generatePermutations() {
			const { materials = [], exclude_materials = [], material_instances = [] } = block.data.block.dir

			// Don't create material permutations for the current variant.
			if ( materials === null ) {
				return
			}

			const permutations = getMaterialPermutations( materials, exclude_materials, material_instances )

			// Filter material instances to use
			// const permutations = filterMaterialInstances( materials, material_instances )

			return Object.entries( permutations ).forEach( ( [ permutationName, permutationElement ] ) => {
				const materialInstances = generateMaterialInstances( permutationElement.materialInstances )

				return newPermutationFromMaterial( permutationName, materialInstances )
			} )
		},
	}
}
