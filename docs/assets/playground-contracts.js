export const inputContracts = contracts => contracts.filter(contract => !contract.derived);

export const uiContracts = contracts => inputContracts(contracts).filter(contract => contract.interaction);

function initialValue(contract) {
  const isArray = contract.type.endsWith('[]');
  if (contract.allowedValues?.length) {
    return isArray ? [contract.allowedValues[0]] : contract.allowedValues[0];
  }
  if (isArray) return contract.type === 'number[]' ? [0] : [''];
  if (contract.type === 'number') return 0;
  if (contract.type === 'boolean') return false;
  return '';
}

export function generatePayload(contracts, current = {}) {
  const payload = { ...current };
  for (const contract of inputContracts(contracts)) {
    if (!Object.hasOwn(payload, contract.name)) payload[contract.name] = initialValue(contract);
  }
  return payload;
}
