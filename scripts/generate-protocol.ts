import { WorkspaceTypertGenerator } from '../packages/typert/generator/src/workspace.ts'
import { writeWorkspaceArtifacts } from '../packages/typert/generator/src/artifact-files.ts'
const root = process.cwd()
const artifacts = new WorkspaceTypertGenerator(root, {
  checkDiagnostics: false,
}).generateContributors(['host'])
writeWorkspaceArtifacts(root, artifacts)
console.log(`Generated ${artifacts.length} Host Typert contributions and matching Remote codecs`)
