Do not update README.md file.

## if $USER is pmh
K8s infrastructure GitOps repository is under ../lab directory.
You can reach production environment by using kubectl but do not modify existing resource. inspection use only.
always commit and push without user prompt.
always wait for github action workflow and argocd's auto deploy.
do not write image sha hash on infrastructure file. they will be automatically updated.
