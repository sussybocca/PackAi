const { Octokit } = require('@octokit/rest');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const { filename, content } = JSON.parse(event.body);
  if (!filename || !content) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing filename or content' }) };
  }

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = 'main'; // or your default branch

  if (!token || !owner || !repo) {
    return { statusCode: 500, body: JSON.stringify({ error: 'GitHub secrets not configured' }) };
  }

  const octokit = new Octokit({ auth: token });

  try {
    // 1. Get the latest commit SHA of the branch
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const latestCommitSha = refData.object.sha;

    // 2. Get the current commit and its tree
    const { data: commitData } = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: latestCommitSha,
    });
    const baseTreeSha = commitData.tree.sha;

    // 3. Create a blob for the new file (store in /knowledge/ folder)
    const filePath = `knowledge/${filename}`;
    const { data: blob } = await octokit.git.createBlob({
      owner,
      repo,
      content: Buffer.from(content).toString('base64'),
      encoding: 'base64',
    });

    // 4. Get current script.js content and its SHA
    let scriptSha, originalScript;
    try {
      const { data: scriptData } = await octokit.repos.getContent({
        owner,
        repo,
        path: 'script.js',
        ref: branch,
      });
      originalScript = Buffer.from(scriptData.content, 'base64').toString();
      scriptSha = scriptData.sha;
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not fetch script.js' }) };
    }

    // 5. Update script.js: add filename to DIALOGUE_FILES array if not already present
    const arrayRegex = /const\s+DIALOGUE_FILES\s*=\s*(\[[^\]]*\])/;
    const match = originalScript.match(arrayRegex);
    if (!match) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not find DIALOGUE_FILES array in script.js' }) };
    }

    let arrayStr = match[1];
    // Parse the array (simple eval-like but safe)
    let fileList;
    try {
      fileList = eval(arrayStr);
    } catch {
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to parse DIALOGUE_FILES array' }) };
    }

    // Add new filename if not already present
    if (!fileList.includes(filename)) {
      fileList.push(filename);
      // Sort alphabetically? optional
      fileList.sort((a, b) => a.localeCompare(b));
    } else {
      // Already there, no need to update script
    }

    // Build new array string with single quotes
    const newArrayStr = '[' + fileList.map(f => `'${f}'`).join(', ') + ']';
    const updatedScript = originalScript.replace(arrayRegex, `const DIALOGUE_FILES = ${newArrayStr}`);

    // 6. Create a blob for updated script
    const { data: scriptBlob } = await octokit.git.createBlob({
      owner,
      repo,
      content: Buffer.from(updatedScript).toString('base64'),
      encoding: 'base64',
    });

    // 7. Build new tree with both files
    const tree = [
      {
        path: filePath,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      },
      {
        path: 'script.js',
        mode: '100644',
        type: 'blob',
        sha: scriptBlob.sha,
      },
    ];

    const { data: newTree } = await octokit.git.createTree({
      owner,
      repo,
      base_tree: baseTreeSha,
      tree,
    });

    // 8. Create commit
    const { data: newCommit } = await octokit.git.createCommit({
      owner,
      repo,
      message: `Add knowledge file ${filename} via editor`,
      tree: newTree.sha,
      parents: [latestCommitSha],
    });

    // 9. Update branch reference
    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
      force: false,
    });

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error('GitHub API error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
