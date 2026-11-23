'use strict';

async function deliver(target, file) {
  const response = await fetch(target, {
    method: 'PUT',
    headers: { 'content-type': file.contentType },
    body: file.body,
  });
  if (!response.ok) throw new Error(`delivery to ${target} answered ${response.status}`);
}

module.exports = { deliver };
