package repositories

import "errors"


type repoErrors struct{
	NotFound error
}

var RepoErrors = repoErrors{
	NotFound: errors.New("not found"),
}