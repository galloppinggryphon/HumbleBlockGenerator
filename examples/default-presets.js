import _ from 'lodash'

export default function PresetFns( { prefix, logger, log, utils } ) {
	const { hasPrefix, replaceTemplates, replaceTemplatesInObject } = utils

	return {
		subVariants( { data, preset, params, presetConfig } ) {
			const argKeys = presetConfig.required

			// Merge defaults with params
			Object.assign( params, presetConfig.params )
			const paramKeys = Object.keys( params )

			// log( paramKeys )

			// Do some checks
			const missingKeys = argKeys.filter( ( key ) => ! paramKeys.includes( key ) )

			if ( missingKeys.length ) {
				logger.error( `Requested preset '${ preset }' is missing required arguments: ${ missingKeys.join( ', ' ) }.` )
			}

			log( { params } )
			log( '****************************************************' )

			const { permutation_condition, event, transform_trigger_item, variant_props, variants_max, property } = params

			log( { variant_props, variants_max } )

			// ~ Start building block props ~

			// Prepare variables to replace templates
			const variables = { ...params, prefix }

			// Generate sequence of custom state values
			const variantStates = [ ...Array( variants_max ).keys() ]
			log( { variantStates } )

			_.merge( data.properties, {
				[ property ]: variantStates,
			} )

			// Add event trigger
			variables.transform_trigger_item = replaceTemplates( transform_trigger_item, variables, [ '{{', '}}' ] )

			const _events = replaceTemplatesInObject( presetConfig.templates.events, variables, [ '{{', '}}' ] )
			const { action, ...eventTemplate } = _events[ event ]

			// let condition = replaceTemplates( permutation_condition, variables, [ '{{', '}}' ] )

			log( { eventTemplate } )
			data[ event ] = {
				...eventTemplate,
				event,
			}

			// Add event to events section
			const _event = {}
			_event.sequence = _event.sequence ?? []
			_event.sequence.push( ...action )
			data.events = data.events ?? {}
			data.events[ event ] = _event

			// Generate permutations or part_visibility values
			for ( const [ propName, propStates ] of Object.entries( variant_props ) ) {
				// Cycle through values in each propSet
				for ( const [ propValue, stateValue ] of Object.entries( propStates ) ) {
					// Generate conditional rule
					let condition = replaceTemplates( permutation_condition, variables, [ '{{', '}}' ] )
					condition = condition.replace( '%property_value%', stateValue )

					// Replace template strings in key
					const _key = replaceTemplates( propValue, variables, [ '{{', '}}' ] )

					if ( propName === 'part_visibility' ) {
						data.part_visibility = data.part_visibility ?? { rules: {} }

						// "pillar_nw": "query.block_property('bcastl:variant') == 1"
						// blockface/material_instance: condition
						data.part_visibility.rules[ _key ] = condition
					}
					else {
						data.permutations = data.permutations ?? []

						data.permutations.push( {
							condition,
							[ propName ]: _key,
						} )
					}
				}
			}

			// log( _event.sequence )

			return data
		},
	}
}

function Block( identifier = undefined ) {
	const description = {}
	const components = {}
	const events = {}
	const permutations = []

	return {
		data: { description, components, events, permutations },
	}
}
