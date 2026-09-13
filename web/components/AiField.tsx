'use client'

import type { ComponentPropsWithoutRef, ReactElement, Ref } from 'react'

type CommonProps = {
  fieldKey: string
  label: string
  entityType?: string
  entityId?: string
  entityLabel?: string
  section?: string
  hint?: string
  formId?: string
}

type InputProps = CommonProps &
  ComponentPropsWithoutRef<'input'> & { as?: 'input' }

type TextareaProps = CommonProps &
  ComponentPropsWithoutRef<'textarea'> & { as: 'textarea' }

type SelectProps = CommonProps &
  ComponentPropsWithoutRef<'select'> & { as: 'select' }

export type AiFieldProps = InputProps | TextareaProps | SelectProps

function scopeAttrs(props: CommonProps) {
  return {
    'data-ai-field': props.fieldKey,
    'data-ai-hint': props.hint,
    'data-ai-entity-type': props.entityType,
    'data-ai-entity-id': props.entityId,
    'data-ai-entity-label': props.entityLabel,
    'data-ai-form': props.formId,
    title: props.label,
    'aria-label': props.label,
  }
}

export default function AiField(props: AiFieldProps): ReactElement {
  const {
    as = 'input',
    fieldKey,
    label,
    entityType,
    entityId,
    entityLabel,
    section,
    hint,
    formId,
    ...rest
  } = props

  const attrs = scopeAttrs({
    fieldKey,
    label,
    entityType,
    entityId,
    entityLabel,
    section,
    hint,
    formId,
  })

  if (as === 'textarea') {
    const { ref, ...textareaRest } = rest as TextareaProps & { ref?: Ref<HTMLTextAreaElement> }
    return <textarea ref={ref} {...attrs} {...textareaRest} />
  }

  if (as === 'select') {
    const { ref, ...selectRest } = rest as SelectProps & { ref?: Ref<HTMLSelectElement> }
    return <select ref={ref} {...attrs} {...selectRest} />
  }

  const { ref, ...inputRest } = rest as InputProps & { ref?: Ref<HTMLInputElement> }
  return <input ref={ref} {...attrs} {...inputRest} />
}
